// Punto 11: veterinarias de entrega (administración, solicitudes, catálogo y veterinarias de cada mascota)
const { API, api, auth, resetDb, createUser, createPet, createClinic, captureMail, ALL_WEEK } = require('./helpers');
const { Notification, StaffRole, VetClinic } = require('../src/models');

const SCHEDULE = {
  mon: { open: '08:00', close: '18:00' }, tue: { open: '08:00', close: '18:00' }, wed: { open: '08:00', close: '18:00' },
  thu: { open: '08:00', close: '18:00' }, fri: { open: '08:00', close: '18:00' }, sat: { open: '08:00', close: '13:00' }, sun: null,
};
const clinicBody = (over = {}) => ({
  name: 'Veterinaria Cabecera', address: 'Calle 48 # 33-21', city: 'bucaramanga', phone: '607 643 2211', schedule: SCHEDULE, ...over,
});

let admin;
let mails;
beforeAll(async () => {
  await resetDb();
  admin = await createUser({ role: 'admin' });
});
beforeEach(() => {
  jest.restoreAllMocks();
  mails = captureMail();
});

describe('Administración de veterinarias', () => {
  test('crear: ciudad canónica, aprobada y habilitada; valida ciudad, horario y nombre repetido', async () => {
    const res = await api().post(`${API}/admin/clinics`).set(auth(admin.token)).send(clinicBody()).expect(201);
    expect(res.body.data).toMatchObject({ city: 'Bucaramanga', status: 'approved', isActive: true, schedule: SCHEDULE });

    const city = await api().post(`${API}/admin/clinics`).set(auth(admin.token)).send(clinicBody({ name: 'Otra', city: 'Medellín' })).expect(400);
    expect(city.body.error.details[0]).toMatchObject({ field: 'body.city' });
    await api().post(`${API}/admin/clinics`).set(auth(admin.token))
      .send(clinicBody({ name: 'Corta', schedule: { mon: { open: '08:00', close: '08:30' } } })).expect(400);
    await api().post(`${API}/admin/clinics`).set(auth(admin.token)).send(clinicBody({ name: 'Cerrada', schedule: {} })).expect(400);
    await api().post(`${API}/admin/clinics`).set(auth(admin.token))
      .send(clinicBody({ name: 'Mala hora', schedule: { mon: { open: '8:00', close: '18:00' } } })).expect(400);
    const dup = await api().post(`${API}/admin/clinics`).set(auth(admin.token)).send(clinicBody({ name: 'VETERINARIA CABECERA', city: 'Bucaramanga' })).expect(409);
    expect(dup.body.error.message).toContain('Ya existe');
    // Floridablanca sin tilde/mayúsculas → nombre canónico
    const flo = await api().post(`${API}/admin/clinics`).set(auth(admin.token)).send(clinicBody({ name: 'Cañaveral', city: 'FLORIDABLANCA ' })).expect(201);
    expect(flo.body.data.city).toBe('Floridablanca');
  });

  test('editar: cambia horario; no deja habilitar una no aprobada', async () => {
    const c = (await api().post(`${API}/admin/clinics`).set(auth(admin.token)).send(clinicBody({ name: 'Editable', city: 'Piedecuesta' }))).body.data;
    const res = await api().patch(`${API}/admin/clinics/${c.id}`).set(auth(admin.token))
      .send({ phone: '3001234567', schedule: { ...SCHEDULE, sun: { open: '09:00', close: '12:00' } } }).expect(200);
    expect(res.body.data.schedule.sun).toEqual({ open: '09:00', close: '12:00' });
    const pending = await createClinic({ city: 'Piedecuesta', status: 'pending', isActive: false });
    await api().patch(`${API}/admin/clinics/${pending.id}`).set(auth(admin.token)).send({ isActive: true }).expect(409);
    await api().patch(`${API}/admin/clinics/${c.id}`).set(auth(admin.token)).send({}).expect(400);
  });

  test('listar por estado (de la más nueva a la más vieja) con todos los campos', async () => {
    const res = await api().get(`${API}/admin/clinics?status=all`).set(auth(admin.token)).expect(200);
    const dates = res.body.data.map((c) => new Date(c.createdAt).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
    expect(Object.keys(res.body.data[0])).toEqual(expect.arrayContaining([
      'id', 'name', 'address', 'city', 'phone', 'schedule', 'isActive', 'status', 'contactName', 'contactEmail', 'rejectionReason', 'createdAt',
    ]));
    const pending = await api().get(`${API}/admin/clinics?status=pending`).set(auth(admin.token)).expect(200);
    expect(pending.body.data.every((c) => c.status === 'pending')).toBe(true);
  });
});

describe('Solicitud pública y revisión', () => {
  test('solicitar → pending/inactiva, avisa al equipo (correo + notificación) y confirma al solicitante; aprobar y rechazar', async () => {
    const staffRole = await StaffRole.create({ name: 'Veterinarias', permissions: ['veterinarias'] });
    const reviewer = await createUser({ role: 'staff', staffRoleId: staffRole.id });
    const other = await StaffRole.create({ name: 'Solo soporte', permissions: ['soporte'] });
    const notReviewer = await createUser({ role: 'staff', staffRoleId: other.id });

    const body = clinicBody({ name: 'Mascotas Felices', contactName: 'Laura Gómez', contactEmail: 'laura@mascotas.co' });
    const res = await api().post(`${API}/clinics/requests`).send(body).expect(201);
    expect(res.body.data).toMatchObject({ status: 'pending', isActive: false, contactEmail: 'laura@mascotas.co' });
    expect(mails.map((m) => m.to)).toEqual(expect.arrayContaining(['soporte@puppymarketcol.com', 'laura@mascotas.co']));
    const types = async (u) => (await Notification.findAll({ where: { userId: u.user.id } })).map((n) => n.type);
    expect(await types(admin)).toContain('clinic.requested');
    expect(await types(reviewer)).toContain('clinic.requested');
    expect(await types(notReviewer)).not.toContain('clinic.requested');

    await api().post(`${API}/clinics/requests`).send(body).expect(409); // mismo nombre y ciudad
    await api().post(`${API}/clinics/requests`).send({ ...body, name: 'Sin contacto', contactEmail: undefined }).expect(400);

    // No sale en el catálogo hasta aprobarla
    const before = await api().get(`${API}/catalogs/clinics?city=Bucaramanga`).expect(200);
    expect(before.body.data.map((c) => c.name)).not.toContain('Mascotas Felices');

    mails.length = 0;
    const approved = await api().patch(`${API}/admin/clinics/${res.body.data.id}/approve`).set(auth(reviewer.token)).expect(200);
    expect(approved.body.data).toMatchObject({ status: 'approved', isActive: true });
    expect(mails[0]).toMatchObject({ to: 'laura@mascotas.co', subject: expect.stringContaining('aprobada') });
    const after = await api().get(`${API}/catalogs/clinics?city=bucaramanga`).expect(200);
    expect(after.body.data.map((c) => c.name)).toContain('Mascotas Felices');

    const req2 = (await api().post(`${API}/clinics/requests`).send({ ...body, name: 'Rechazable' })).body.data;
    mails.length = 0;
    const rejected = await api().patch(`${API}/admin/clinics/${req2.id}/reject`).set(auth(admin.token)).send({ reason: 'Dirección no verificable' }).expect(200);
    expect(rejected.body.data).toMatchObject({ status: 'rejected', isActive: false, rejectionReason: 'Dirección no verificable' });
    expect(mails[0].html).toContain('Dirección no verificable');

    await api().get(`${API}/admin/clinics`).set(auth(notReviewer.token)).expect(403); // sin permiso
  });
});

describe('Veterinarias de la mascota', () => {
  let seller;
  let vetA;
  let vetB;
  beforeAll(async () => {
    seller = await createUser({ role: 'breeder' });
    vetA = await createClinic({ city: 'Bucaramanga', schedule: SCHEDULE });
    vetB = await createClinic({ city: 'Bucaramanga', schedule: ALL_WEEK });
  });

  test('una venta exige al menos una; deben estar habilitadas y ser de la ciudad de la mascota', async () => {
    const none = await createPet(seller.token, { city: 'Bucaramanga', clinicIds: [] });
    expect(none.status).toBe(400);
    expect(none.body.error.details[0].field).toBe('body.clinicIds');

    const other = await createClinic({ city: 'Piedecuesta' });
    const wrongCity = await createPet(seller.token, { city: 'Bucaramanga', clinicIds: [other.id] });
    expect(wrongCity.status).toBe(400);
    expect(wrongCity.body.error.details[0].message).toContain('no es de Bucaramanga');

    const disabled = await createClinic({ city: 'Bucaramanga', isActive: false });
    expect((await createPet(seller.token, { city: 'Bucaramanga', clinicIds: [disabled.id] })).status).toBe(400);
    const pending = await createClinic({ city: 'Bucaramanga', status: 'pending' });
    expect((await createPet(seller.token, { city: 'Bucaramanga', clinicIds: [pending.id] })).status).toBe(400);

    // Una adopción puede no tener veterinarias
    expect((await createPet(seller.token, { city: 'Bucaramanga', adoptionType: 'adoption', price: 0, clinicIds: [] })).status).toBe(201);
  });

  test('varias veterinarias con el horario del vendedor; el DTO las trae en detalle, listado, /mine y favoritos', async () => {
    const availability = { mon: { open: '09:00', close: '12:00' }, sat: { open: '08:00', close: '13:00' } };
    const res = await createPet(seller.token, {
      city: 'bucaramanga', clinicIds: [vetA.id, vetB.id], clinicAvailability: [{ clinicId: vetA.id, availability }],
    });
    expect(res.status).toBe(201);
    const byId = Object.fromEntries(res.body.data.clinics.map((c) => [c.id, c]));
    expect(byId[vetA.id]).toMatchObject({ availability: { ...availability, tue: null, wed: null, thu: null, fri: null, sun: null }, isActive: true, schedule: SCHEDULE });
    expect(byId[vetB.id].availability).toBeNull();

    const buyer = await createUser();
    await api().post(`${API}/favorites/${res.body.data.id}`).set(auth(buyer.token)).expect(201);
    const fav = (await api().get(`${API}/favorites`).set(auth(buyer.token))).body.data[0];
    const mine = (await api().get(`${API}/pets/mine`).set(auth(seller.token))).body.data.items.find((p) => p.id === res.body.data.id);
    const list = (await api().get(`${API}/pets?city=bucaramanga`)).body.data.items.find((p) => p.id === res.body.data.id);
    [fav, mine, list].forEach((p) => expect(p.clinics).toHaveLength(2));
  });

  test('horario del vendedor fuera del de la veterinaria → 400 en clinicAvailability', async () => {
    const res = await createPet(seller.token, {
      city: 'Bucaramanga', clinicIds: [vetA.id],
      clinicAvailability: [{ clinicId: vetA.id, availability: { sun: { open: '09:00', close: '12:00' } } }], // la veterinaria no abre domingo
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('body.clinicAvailability');
    const late = await createPet(seller.token, {
      city: 'Bucaramanga', clinicIds: [vetA.id],
      clinicAvailability: [{ clinicId: vetA.id, availability: { mon: { open: '07:00', close: '12:00' } } }], // abre antes que la veterinaria
    });
    expect(late.status).toBe(400);
  });

  test('PATCH: clinicIds reemplaza la lista; cambiar de ciudad exige veterinarias de la ciudad nueva', async () => {
    const pet = (await createPet(seller.token, { city: 'Bucaramanga', clinicIds: [vetA.id, vetB.id] })).body.data;
    const res = await api().patch(`${API}/pets/${pet.id}`).set(auth(seller.token)).field('clinicIds', vetB.id).expect(200);
    expect(res.body.data.clinics.map((c) => c.id)).toEqual([vetB.id]);
    const noClinics = await api().patch(`${API}/pets/${pet.id}`).set(auth(seller.token)).field('name', 'Solo nombre').expect(200);
    expect(noClinics.body.data.clinics).toHaveLength(1); // sin clinicIds se deja como estaba

    const move = await api().patch(`${API}/pets/${pet.id}`).set(auth(seller.token)).field('city', 'Piedecuesta').expect(400);
    expect(move.body.error.details[0].field).toBe('body.clinicIds');
    const pie = await createClinic({ city: 'Piedecuesta' });
    const moved = await api().patch(`${API}/pets/${pet.id}`).set(auth(seller.token)).field('city', 'Piedecuesta').field('clinicIds', pie.id).expect(200);
    expect(moved.body.data).toMatchObject({ city: 'Piedecuesta', clinics: [expect.objectContaining({ id: pie.id })] });
  });

  test('deshabilitar una veterinaria: avisa al vendedor que se quedó sin veterinarias; el DTO la marca inactiva', async () => {
    const solo = await createClinic({ city: 'Floridablanca' });
    const pet = (await createPet(seller.token, { city: 'Floridablanca', clinicIds: [solo.id] })).body.data;
    await Notification.destroy({ where: {} });
    await api().patch(`${API}/admin/clinics/${solo.id}`).set(auth(admin.token)).send({ isActive: false }).expect(200);
    const n = await Notification.findAll({ where: { userId: seller.user.id } });
    expect(n.map((x) => x.type)).toEqual(['pet.clinics_unavailable']);
    expect(n[0].data.petId).toBe(pet.id);
    const detail = (await api().get(`${API}/pets/${pet.id}`)).body.data;
    expect(detail.clinics[0].isActive).toBe(false);
    expect((await VetClinic.findByPk(solo.id)).isActive).toBe(false);
  });
});
