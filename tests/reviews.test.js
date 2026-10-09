// Punto 15: encuesta de satisfacción y calificación del vendedor
const { API, api, auth, resetDb, createUser, createPet, captureMail } = require('./helpers');
const { Appointment, Notification, StaffRole } = require('../src/models');
const { runAppointmentJobs } = require('../src/modules/appointments/appointment.jobs');

let seller;
let buyer;
let admin;
beforeAll(async () => {
  await resetDb();
  seller = await createUser({ role: 'breeder', fullName: 'Criadero Sol' });
  buyer = await createUser({ fullName: 'Ana Compradora' });
  admin = await createUser({ role: 'admin' });
});
beforeEach(() => {
  jest.restoreAllMocks();
  captureMail();
});

const DAY = 86400000;
// Cita en el pasado (las encuestas son de citas de hace 3 días o más)
const pastAppointment = async (daysAgo, status = 'confirmed', who = buyer) => {
  const pet = (await createPet(seller.token, { name: `Mascota ${daysAgo}${status}` })).body.data;
  return Appointment.create({
    petId: pet.id, clinicId: pet.clinics[0].id, adopterId: who.user.id, status, meetingDate: new Date(Date.now() - daysAgo * DAY),
  });
};
const review = (token, body) => api().post(`${API}/reviews`).set(auth(token)).send(body);

describe('Encuesta', () => {
  test('pendientes: solo citas confirmadas o completadas de hace 3+ días y sin calificar', async () => {
    const ok = await pastAppointment(4);
    const done = await pastAppointment(10, 'completed');
    await pastAppointment(1); // muy reciente
    await pastAppointment(5, 'cancelled'); // cancelada
    const res = await api().get(`${API}/reviews/pending`).set(auth(buyer.token)).expect(200);
    expect(res.body.data.map((r) => r.appointmentId).sort()).toEqual([ok.id, done.id].sort());
    expect(res.body.data[0]).toEqual({
      appointmentId: expect.any(String), meetingDate: expect.any(String),
      pet: { name: expect.any(String), imageUrl: expect.any(String) }, seller: { fullName: 'Criadero Sol' },
    });
  });

  test('responder: valida dueño, plazo, rango y duplicado; si dice que hubo compra y sigue confirmada, avisa al vendedor', async () => {
    const appt = await pastAppointment(3.1);
    const stranger = await createUser();
    await review(stranger.token, { appointmentId: appt.id, dealClosed: true, rating: 5 }).expect(404);
    await review(buyer.token, { appointmentId: appt.id, dealClosed: true, rating: 6 }).expect(400);
    await review(buyer.token, { appointmentId: appt.id, dealClosed: true, rating: 5, comment: 'x'.repeat(501) }).expect(400);
    const early = await pastAppointment(1);
    await review(buyer.token, { appointmentId: early.id, dealClosed: true, rating: 5 }).expect(409);

    await review(buyer.token, { appointmentId: appt.id, dealClosed: true, rating: 4, comment: 'Muy amables' }).expect(201);
    await review(buyer.token, { appointmentId: appt.id, dealClosed: true, rating: 4 }).expect(409);
    expect(await Notification.findOne({ where: { userId: seller.user.id, type: 'review.deal_closed' } })).toBeTruthy();
  });
});

describe('Promedio público y vistas privadas', () => {
  test('owner.rating en las mascotas (un decimal, sin comentarios); /reviews/mine con resumen y comentarios', async () => {
    const a1 = await pastAppointment(6);
    const a2 = await pastAppointment(7, 'completed');
    await review(buyer.token, { appointmentId: a1.id, dealClosed: true, rating: 5, comment: 'Excelente' }).expect(201);
    await review(buyer.token, { appointmentId: a2.id, dealClosed: false, rating: 2, comment: 'Llegó tarde' }).expect(201);

    // 3 calificaciones en total (4 del test anterior + 5 + 2) → 3.7
    const pet = (await createPet(seller.token)).body.data;
    expect(pet.owner.rating).toEqual({ average: 3.7, count: 3 });
    const publicJson = JSON.stringify((await api().get(`${API}/pets?limit=50`)).body);
    expect(publicJson).not.toContain('Excelente');
    expect(publicJson).not.toContain('Llegó tarde');

    const mine = (await api().get(`${API}/reviews/mine`).set(auth(seller.token)).expect(200)).body.data;
    expect(mine.summary).toEqual({ average: 3.7, count: 3, distribution: { 1: 0, 2: 1, 3: 0, 4: 1, 5: 1 } });
    expect(mine.items[0]).toEqual(expect.objectContaining({
      rating: expect.any(Number), dealClosed: expect.any(Boolean), comment: expect.any(String),
      buyer: { fullName: 'Ana Compradora' }, pet: { name: expect.any(String) },
    }));
  });

  test('admin: lista paginada con vendedor, filtros, y ocultar una calificación abusiva recalcula el promedio', async () => {
    const list = (await api().get(`${API}/admin/reviews?limit=2&page=1`).set(auth(admin.token)).expect(200)).body.data;
    expect(list.meta).toMatchObject({ page: 1, total: 3, totalPages: 2 });
    expect(list.items[0].seller.fullName).toBe('Criadero Sol');
    const twoStars = (await api().get(`${API}/admin/reviews?rating=2`).set(auth(admin.token))).body.data.items;
    expect(twoStars).toHaveLength(1);

    await api().patch(`${API}/admin/reviews/${twoStars[0].id}`).set(auth(admin.token)).send({ hidden: true }).expect(200);
    const pet = (await createPet(seller.token)).body.data;
    expect(pet.owner.rating).toEqual({ average: 4.5, count: 2 });

    const noPerm = await StaffRole.create({ name: 'Sin calificaciones', permissions: ['citas'] });
    const staff = await createUser({ role: 'staff', staffRoleId: noPerm.id });
    await api().get(`${API}/admin/reviews`).set(auth(staff.token)).expect(403);
  });

  test('el job avisa una sola vez cuando la encuesta queda disponible', async () => {
    const fresh = await createUser();
    const appt = await pastAppointment(4, 'confirmed', fresh);
    jest.spyOn(require('../src/queue/contract-queue'), 'enqueueContractGeneration').mockImplementation(() => {});
    await runAppointmentJobs();
    await runAppointmentJobs();
    const n = await Notification.findAll({ where: { userId: fresh.user.id, type: 'review.requested' } });
    expect(n).toHaveLength(1);
    expect(n[0].data.appointmentId).toBe(appt.id);
  });
});
