const { API, api, auth, resetDb, createUser, createPet, createClinic, captureMail, futureDate } = require('./helpers');
const { Appointment, Notification, Pet } = require('../src/models');
const { runAppointmentJobs, endOfLocalDay } = require('../src/modules/appointments/appointment.jobs');

let seller;
let buyer;
let fan;
let clinic;
let mails;
beforeAll(async () => {
  await resetDb();
  seller = await createUser({ role: 'breeder', fullName: 'Criadero Sol' });
  buyer = await createUser({ fullName: 'Ana Compradora' });
  fan = await createUser({ fullName: 'Fan Favoritos' });
  clinic = await createClinic({ name: 'Vet Central' });
});
beforeEach(async () => {
  jest.restoreAllMocks();
  mails = captureMail();
  await Notification.destroy({ where: {} });
});

const notifsOf = (user) => Notification.findAll({ where: { userId: user.user.id }, order: [['createdAt', 'ASC']] });
const book = (token, petId, meetingDate = futureDate()) =>
  api().post(`${API}/appointments`).set(auth(token)).send({ petId, clinicId: clinic.id, meetingDate }).expect(201).then((r) => r.body.data);
const setStatus = (token, id, status) => api().patch(`${API}/appointments/${id}/status`).set(auth(token)).send({ status });
const flush = () => new Promise((r) => setImmediate(r)); // los correos salen tras el commit

// Hora local de Bogotá (UTC-5) → instante UTC
const bogota = (base, hour, minute = 0) => new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hour + 5, minute));
const inDays = (n) => new Date(Date.now() + n * 86400000);

describe('Endpoints /notifications', () => {
  test('requiere sesión', async () => {
    await api().get(`${API}/notifications`).expect(401);
  });

  test('lista con items, unreadCount y paginación; filtro unread; marcar una y todas', async () => {
    await Notification.bulkCreate([
      { userId: buyer.user.id, type: 'favorite.adopted', data: { petName: 'Uno' } },
      { userId: buyer.user.id, type: 'favorite.adopted', data: { petName: 'Dos' } },
      { userId: buyer.user.id, type: 'favorite.adopted', data: { petName: 'Tres' }, readAt: new Date() },
      { userId: seller.user.id, type: 'favorite.adopted', data: { petName: 'Ajena' } },
    ]);

    const all = await api().get(`${API}/notifications?limit=2&page=1`).set(auth(buyer.token)).expect(200);
    expect(all.body.data.unreadCount).toBe(2);
    expect(all.body.data.items).toHaveLength(2);
    expect(all.body.data.meta).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(all.body.data.items[0]).toEqual(expect.objectContaining({
      type: 'favorite.adopted', title: expect.any(String), message: expect.any(String), isRead: expect.any(Boolean),
    }));

    const unread = await api().get(`${API}/notifications?unread=true`).set(auth(buyer.token)).expect(200);
    expect(unread.body.data.items.every((n) => !n.isRead)).toBe(true);
    expect(unread.body.data.items).toHaveLength(2);
    const read = await api().get(`${API}/notifications?unread=false`).set(auth(buyer.token)).expect(200);
    expect(read.body.data.items.map((n) => n.data.petName)).toEqual(['Tres']);
    await api().get(`${API}/notifications?unread=quizas`).set(auth(buyer.token)).expect(400);

    const target = unread.body.data.items[0];
    const marked = await api().patch(`${API}/notifications/${target.id}/read`).set(auth(buyer.token)).expect(200);
    expect(marked.body.data.isRead).toBe(true);
    await api().patch(`${API}/notifications/${target.id}/read`).set(auth(buyer.token)).expect(200); // idempotente

    const sellerNotif = await Notification.findOne({ where: { userId: seller.user.id } });
    await api().patch(`${API}/notifications/${sellerNotif.id}/read`).set(auth(buyer.token)).expect(404); // ajena

    const all2 = await api().post(`${API}/notifications/read-all`).set(auth(buyer.token)).expect(200);
    expect(all2.body.data.updated).toBe(1);
    const after = await api().get(`${API}/notifications`).set(auth(buyer.token)).expect(200);
    expect(after.body.data.unreadCount).toBe(0);
    expect((await Notification.findByPk(sellerNotif.id)).readAt).toBeNull(); // no toca las de otros
  });
});

describe('Eventos de citas', () => {
  test('cita creada → vendedor (con correo) y quien la tiene en favoritos (sin correo)', async () => {
    const pet = (await createPet(seller.token, { name: 'Kira' })).body.data;
    await api().post(`${API}/favorites/${pet.id}`).set(auth(fan.token)).expect(201);
    await api().post(`${API}/favorites/${pet.id}`).set(auth(buyer.token)).expect(201);
    await book(buyer.token, pet.id);
    await flush();

    const [toSeller] = await notifsOf(seller);
    expect(toSeller.type).toBe('appointment.created');
    expect(toSeller.data).toMatchObject({ petId: pet.id, petName: 'Kira', adopterName: 'Ana Compradora', clinicName: 'Vet Central' });
    expect((await notifsOf(fan)).map((n) => n.type)).toEqual(['favorite.in_process']);
    expect(await notifsOf(buyer)).toHaveLength(0); // el comprador no se notifica a sí mismo

    expect(mails.map((m) => m.to)).toEqual([seller.user.email]);
    expect(mails[0].subject).toContain('Nueva solicitud de cita');
  });

  test('confirmada → comprador; cancelada por el comprador → vendedor, guardando cancelledBy', async () => {
    const pet = (await createPet(seller.token, { name: 'Bruno' })).body.data;
    const appt = await book(buyer.token, pet.id);
    await setStatus(seller.token, appt.id, 'confirmed').expect(200);
    expect((await notifsOf(buyer)).map((n) => n.type)).toEqual(['appointment.confirmed']);

    await setStatus(buyer.token, appt.id, 'cancelled').expect(200);
    const saved = await Appointment.findByPk(appt.id);
    expect(saved).toMatchObject({ cancelledBy: buyer.user.id, cancellationReason: 'cancelled_by_adopter' });
    const cancelled = (await notifsOf(seller)).find((n) => n.type === 'appointment.cancelled');
    expect(cancelled.data.cancellationReason).toBe('cancelled_by_adopter');

    const detail = await api().get(`${API}/appointments/${appt.id}`).set(auth(seller.token)).expect(200);
    expect(detail.body.data).toMatchObject({ cancelledBy: buyer.user.id, cancellationReason: 'cancelled_by_adopter' });
  });

  test('cancelada por el vendedor → comprador', async () => {
    const pet = (await createPet(seller.token)).body.data;
    const appt = await book(buyer.token, pet.id);
    await setStatus(seller.token, appt.id, 'cancelled').expect(200);
    expect((await Appointment.findByPk(appt.id)).cancellationReason).toBe('cancelled_by_owner');
    const n = (await notifsOf(buyer)).find((x) => x.type === 'appointment.cancelled');
    expect(n).toBeTruthy();
    const dto = (await api().get(`${API}/notifications`).set(auth(buyer.token))).body.data.items.find((x) => x.type === 'appointment.cancelled');
    expect(dto.message).toContain('el vendedor');
  });

  test('completada → comprador; quien la tenía en favoritos recibe "encontró hogar"', async () => {
    const pet = (await createPet(seller.token, { name: 'Milo' })).body.data;
    await api().post(`${API}/favorites/${pet.id}`).set(auth(fan.token)).expect(201);
    const appt = await book(buyer.token, pet.id);
    await setStatus(seller.token, appt.id, 'confirmed').expect(200);
    await setStatus(seller.token, appt.id, 'completed').expect(200);
    expect((await notifsOf(buyer)).map((n) => n.type)).toEqual(['appointment.confirmed', 'appointment.completed']);
    expect((await notifsOf(fan)).map((n) => n.type)).toEqual(['favorite.in_process', 'favorite.adopted']);
  });

  test('una notificación no queda creada si el evento falla (misma transacción)', async () => {
    const pet = (await createPet(seller.token)).body.data;
    await book(buyer.token, pet.id);
    await Notification.destroy({ where: {} });
    const other = await createUser();
    await api().post(`${API}/appointments`).set(auth(other.token))
      .send({ petId: pet.id, clinicId: clinic.id, meetingDate: futureDate() }).expect(409);
    expect(await Notification.count()).toBe(0);
  });
});

describe('Eventos de cuentas', () => {
  test('verificación otorgada y revocada → vendedor, con correo', async () => {
    const admin = await createUser({ role: 'admin' });
    const org = await createUser({ role: 'shelter' });
    await api().patch(`${API}/admin/organizations/${org.user.id}/verify`).set(auth(admin.token)).expect(200);
    await api().patch(`${API}/admin/organizations/${org.user.id}/revoke`).set(auth(admin.token)).expect(200);
    await flush();
    expect((await notifsOf(org)).map((n) => n.type)).toEqual(['organization.verified', 'organization.revoked']);
    expect(mails.filter((m) => m.to === org.user.email).map((m) => m.subject)).toEqual([
      expect.stringContaining('Cuenta verificada'), expect.stringContaining('Verificación retirada'),
    ]);
  });

  test('suspensión cancela las citas y avisa solo a la contraparte', async () => {
    const admin = await createUser({ role: 'admin' });
    const badSeller = await createUser({ role: 'breeder' });
    const pet = (await createPet(badSeller.token, { name: 'Rex' })).body.data;
    const appt = await book(buyer.token, pet.id);
    await Notification.destroy({ where: {} });

    await api().patch(`${API}/admin/users/${badSeller.user.id}/suspend`).set(auth(admin.token)).expect(200);
    expect(await Appointment.findByPk(appt.id)).toMatchObject({ cancelledBy: admin.user.id, cancellationReason: 'account_suspended' });
    const n = await notifsOf(buyer);
    expect(n.map((x) => x.type)).toEqual(['appointment.cancelled']);
    expect(n[0].data.cancellationReason).toBe('account_suspended');
    expect(await notifsOf(badSeller)).toHaveLength(0);
  });
});

describe('Listado de citas para cualquier rol', () => {
  test('un refugio que agenda como comprador ve su cita (antes no aparecía)', async () => {
    const shelter = await createUser({ role: 'shelter' });
    const pet = (await createPet(seller.token)).body.data;
    const appt = await book(shelter.token, pet.id);
    const res = await api().get(`${API}/appointments`).set(auth(shelter.token)).expect(200);
    expect(res.body.data.items.map((a) => a.id)).toContain(appt.id);
    const sellerList = await api().get(`${API}/appointments`).set(auth(seller.token)).expect(200);
    expect(sellerList.body.data.items.map((a) => a.id)).toContain(appt.id);
  });
});

describe('Tarea programada de citas', () => {
  // El job barre TODAS las citas: se parte de cero para que no actúe sobre las de los tests anteriores
  beforeEach(() => Appointment.destroy({ where: {}, force: true }));

  test('fin del día local en Bogotá', () => {
    const now = new Date(Date.UTC(2026, 9, 1, 15, 0)); // 10:00 en Bogotá
    expect(endOfLocalDay(now).toISOString()).toBe('2026-10-02T04:59:59.999Z'); // 23:59:59.999 en Bogotá
  });

  test('recordatorio del día a ambas partes, una sola vez; de madrugada solo las próximas 3 h', async () => {
    const day = inDays(10);
    const pet = (await createPet(seller.token, { name: 'Luna' })).body.data;
    const appt = await book(buyer.token, pet.id, bogota(day, 15).toISOString());
    await setStatus(seller.token, appt.id, 'confirmed').expect(200);
    await Notification.destroy({ where: {} });

    expect((await runAppointmentJobs(bogota(day, 5))).recordatorios).toBe(0); // 5 a. m.: la de las 3 p. m. todavía no
    expect((await runAppointmentJobs(bogota(day, 9))).recordatorios).toBe(1); // 9 a. m.: sí
    expect((await runAppointmentJobs(bogota(day, 10))).recordatorios).toBe(0); // no se repite
    expect((await notifsOf(buyer)).map((n) => n.type)).toEqual(['appointment.reminder']);
    expect((await notifsOf(seller)).map((n) => n.type)).toEqual(['appointment.reminder']);

    // Una cita a las 7:30 a. m. sí se recuerda a las 5 a. m. (está dentro de las próximas 3 h)
    const pet2 = (await createPet(seller.token)).body.data;
    const early = await book(buyer.token, pet2.id, bogota(inDays(11), 7, 30).toISOString());
    await setStatus(seller.token, early.id, 'confirmed').expect(200);
    expect((await runAppointmentJobs(bogota(inDays(11), 5))).recordatorios).toBe(1);
  });

  test('pendiente vencida → se cancela sola (expired), la mascota se libera y se avisa a ambos', async () => {
    const meeting = bogota(inDays(12), 15);
    const pet = (await createPet(seller.token)).body.data;
    const appt = await book(buyer.token, pet.id, meeting.toISOString());
    await flush();
    await Notification.destroy({ where: {} });
    mails.length = 0; // se descarta el correo de "nueva solicitud" de la creación

    const r = await runAppointmentJobs(new Date(meeting.getTime() + 60000));
    expect(r.vencidas).toBe(1);
    expect(await Appointment.findByPk(appt.id)).toMatchObject({ status: 'cancelled', cancelledBy: null, cancellationReason: 'expired' });
    expect((await Pet.findByPk(pet.id)).status).toBe('available');
    expect((await notifsOf(buyer)).map((n) => n.type)).toEqual(['appointment.expired']);
    expect((await notifsOf(seller)).map((n) => n.type)).toEqual(['appointment.expired']);
    await flush();
    expect(mails.map((m) => m.to).sort()).toEqual([buyer.user.email, seller.user.email].sort());
  });

  test('confirmada sin cerrar 24 h después → aviso al vendedor una sola vez', async () => {
    const meeting = bogota(inDays(13), 15);
    const pet = (await createPet(seller.token)).body.data;
    const appt = await book(buyer.token, pet.id, meeting.toISOString());
    await setStatus(seller.token, appt.id, 'confirmed').expect(200);
    await Notification.destroy({ where: {} });

    expect((await runAppointmentJobs(new Date(meeting.getTime() + 2 * 3600000))).sinCerrar).toBe(0);
    const later = new Date(meeting.getTime() + 25 * 3600000);
    expect((await runAppointmentJobs(later)).sinCerrar).toBe(1);
    expect((await runAppointmentJobs(later)).sinCerrar).toBe(0);
    expect((await notifsOf(seller)).map((n) => n.type)).toEqual(['appointment.overdue']);
    expect(await notifsOf(buyer)).toHaveLength(0);
  });
});
