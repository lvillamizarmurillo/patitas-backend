// Puntos 11.7, 12 y 14: horario de la veterinaria ∩ vendedor, ventana de 3 días y propuesta de otro horario
const { API, api, auth, resetDb, createUser, createPet, createClinic, captureMail, book, slotFor, scheduleFor, ALL_WEEK, waitFor } = require('./helpers');
const { Appointment, Notification, Pet } = require('../src/models');
const { bookableDays, availableSlots } = require('../src/utils/schedule');
const { zonedToUtc } = require('../src/utils/time');
const { runAppointmentJobs } = require('../src/modules/appointments/appointment.jobs');

let seller;
let buyer;
let clinic;
let mails;
beforeAll(async () => {
  await resetDb();
  seller = await createUser({ role: 'breeder', fullName: 'Criadero Sol' });
  buyer = await createUser({ fullName: 'Ana Compradora' });
  clinic = await createClinic({ city: 'Bucaramanga', schedule: ALL_WEEK });
});
beforeEach(() => {
  jest.restoreAllMocks();
  mails = captureMail();
  jest.spyOn(require('../src/queue/contract-queue'), 'enqueueContractGeneration').mockImplementation(() => {});
});

const newPet = async (fields = {}) => (await createPet(seller.token, { city: 'Bucaramanga', clinicIds: [clinic.id], ...fields })).body.data;
const plusMinutes = (iso, m) => new Date(new Date(iso).getTime() + m * 60000).toISOString();
const fieldMsg = (res) => res.body.error.details[0];

describe('Reglas de horario al agendar', () => {
  test('dentro del horario y en :00/:30; fuera → 400 "La veterinaria no atiende a esa hora"', async () => {
    const pet = await newPet();
    const slot = slotFor(ALL_WEEK, { day: 1 });
    const offMinute = await book(buyer.token, pet, { meetingDate: plusMinutes(slot, 15) }).expect(400);
    expect(fieldMsg(offMinute)).toEqual({ field: 'body.meetingDate', message: 'La veterinaria no atiende a esa hora' });

    // 22:00 no sirve: el último horario es media hora antes del cierre (21:30)
    const [y, m, d] = Object.keys(availableSlots(ALL_WEEK))[1].split('-').map(Number);
    await book(buyer.token, pet, { meetingDate: zonedToUtc(y, m, d, 22 * 60).toISOString() }).expect(400);
    await book(buyer.token, pet, { meetingDate: zonedToUtc(y, m, d, 21 * 60 + 30).toISOString() }).expect(201);
  });

  test('solo los 3 próximos días con horarios → 400 "Elige uno de los próximos días disponibles"', async () => {
    const pet = await newPet();
    const thirdDay = slotFor(ALL_WEEK, { day: 2 });
    const weekLater = plusMinutes(thirdDay, 7 * 24 * 60); // mismo día de la semana y hora, pero fuera de la ventana
    const res = await book(buyer.token, pet, { meetingDate: weekLater }).expect(400);
    expect(fieldMsg(res)).toEqual({ field: 'body.meetingDate', message: 'Elige uno de los próximos días disponibles' });
  });

  test('los días sin atención se saltan (cuenta 3 días CON horarios)', () => {
    // Jueves 18:00 en Bogotá, domingo cerrado → viernes, sábado y lunes (ejemplo del documento)
    const schedule = { ...ALL_WEEK, sun: null };
    const thursdayEvening = new Date(Date.UTC(2026, 9, 8, 23, 0));
    expect(bookableDays({ ...schedule, thu: { open: '06:00', close: '18:00' } }, thursdayEvening)).toEqual(['2026-10-09', '2026-10-10', '2026-10-12']);
  });

  test('el horario del vendedor recorta el de la veterinaria (intersección)', async () => {
    const days = Object.keys(availableSlots(ALL_WEEK));
    const weekday = new Date(`${days[1]}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).slice(0, 3).toLowerCase();
    const availability = { [weekday]: { open: '10:00', close: '12:00' } }; // el vendedor solo puede 10:00-11:30 ese día
    const pet = await newPet({ clinicAvailability: [{ clinicId: clinic.id, availability }] });
    const [y, m, d] = days[1].split('-').map(Number);
    await book(buyer.token, pet, { meetingDate: zonedToUtc(y, m, d, 9 * 60).toISOString() }).expect(400); // la veterinaria sí, el vendedor no
    const effective = await scheduleFor(pet.id, clinic.id);
    expect(effective[weekday]).toEqual({ open: '10:00', close: '12:00' });
    await book(buyer.token, pet, { meetingDate: zonedToUtc(y, m, d, 11 * 60 + 30).toISOString() }).expect(201);
  });

  test('una veterinaria deshabilitada después de publicar ya no acepta citas', async () => {
    const vet = await createClinic({ city: 'Bucaramanga' });
    const pet = await newPet({ clinicIds: [vet.id] });
    await vet.update({ isActive: false });
    const res = await book(buyer.token, pet).expect(400);
    expect(fieldMsg(res).field).toBe('body.clinicId');
  });

  test('una mascota sin veterinarias (publicación anterior) acepta cualquiera habilitada', async () => {
    const pet = await newPet({ adoptionType: 'adoption', price: 0, clinicIds: [] });
    await book(buyer.token, pet, { clinicId: clinic.id }).expect(201);
  });
});

describe('Otro horario (punto 14)', () => {
  const propose = (token, id, meetingDate) => api().post(`${API}/appointments/${id}/proposal`).set(auth(token)).send({ meetingDate });
  const accept = (token, id) => api().post(`${API}/appointments/${id}/proposal/accept`).set(auth(token));
  const reject = (token, id) => api().post(`${API}/appointments/${id}/proposal/reject`).set(auth(token));

  test('el vendedor propone, el comprador acepta → confirmada con la nueva fecha', async () => {
    const pet = await newPet({ name: 'Kira' });
    const appt = (await book(buyer.token, pet, { slot: { day: 0 } }).expect(201)).body.data;
    const newDate = slotFor(ALL_WEEK, { day: 1, index: 2 });

    await propose(buyer.token, appt.id, newDate).expect(403); // solo el vendedor
    await propose(seller.token, appt.id, appt.meetingDate).expect(400); // igual a la actual
    await propose(seller.token, appt.id, plusMinutes(newDate, 10)).expect(400); // fuera de horario
    const res = await propose(seller.token, appt.id, newDate).expect(200);
    expect(res.body.data.proposal).toEqual({ meetingDate: newDate, proposedAt: expect.any(String) });
    expect(res.body.data.status).toBe('pending');

    // Mientras hay propuesta, el vendedor no puede confirmar la original
    await api().patch(`${API}/appointments/${appt.id}/status`).set(auth(seller.token)).send({ status: 'confirmed' }).expect(409);

    const n = await Notification.findOne({ where: { userId: buyer.user.id, type: 'appointment.rescheduled' } });
    expect(n.data.proposedMeetingDate).toBe(newDate);
    await waitFor(() => mails.some((m) => m.to === buyer.user.email && m.subject.includes('propone otro horario')));

    await accept(seller.token, appt.id).expect(403); // solo el comprador
    const ok = await accept(buyer.token, appt.id).expect(200);
    expect(ok.body.data).toMatchObject({ status: 'confirmed', meetingDate: newDate, proposal: null });
    expect(await Notification.findOne({ where: { userId: seller.user.id, type: 'appointment.proposal_accepted' } })).toBeTruthy();
    await accept(buyer.token, appt.id).expect(409); // ya no está por confirmar
  });

  test('el comprador rechaza → cancelada (proposal_rejected), mascota disponible, aviso al vendedor', async () => {
    const pet = await newPet({ name: 'Bruno' });
    const appt = (await book(buyer.token, pet)).body.data;
    await reject(buyer.token, appt.id).expect(409); // no hay propuesta todavía
    await propose(seller.token, appt.id, slotFor(ALL_WEEK, { day: 2 })).expect(200);
    const res = await reject(buyer.token, appt.id).expect(200);
    expect(res.body.data).toMatchObject({ status: 'cancelled', cancelledBy: buyer.user.id, cancellationReason: 'proposal_rejected' });
    expect((await Pet.findByPk(pet.id)).status).toBe('available');
    expect(await Notification.findOne({ where: { userId: seller.user.id, type: 'appointment.proposal_rejected' } })).toBeTruthy();
  });

  test('el vencimiento automático mira la fecha propuesta mientras haya una', async () => {
    const pet = await newPet();
    const now = Date.now();
    const appt = await Appointment.create({
      petId: pet.id, clinicId: clinic.id, adopterId: buyer.user.id, status: 'pending',
      meetingDate: new Date(now - 3600000), proposedMeetingDate: new Date(now + 2 * 86400000), proposedAt: new Date(),
    });
    await Pet.update({ status: 'in_process' }, { where: { id: pet.id } });
    await runAppointmentJobs(new Date(now));
    expect((await Appointment.findByPk(appt.id)).status).toBe('pending'); // la propuesta todavía no vence
    await runAppointmentJobs(new Date(now + 3 * 86400000));
    expect(await Appointment.findByPk(appt.id)).toMatchObject({ status: 'cancelled', cancellationReason: 'expired', proposedMeetingDate: null });
  });
});
