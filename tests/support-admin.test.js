// Punto 16: bandeja de soporte en el panel admin
const { API, api, auth, resetDb, createUser, captureMail } = require('./helpers');
const { StaffRole, SupportMessage, SupportReply } = require('../src/models');

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

const contact = (body, token) => {
  const req = api().post(`${API}/support/contact`);
  if (token) req.set(auth(token));
  return req.send(body);
};

describe('Bandeja de soporte', () => {
  test('el formulario guarda audience, topic y teléfono (con sesión lo toma de la cuenta)', async () => {
    await contact({ name: 'Vet Norte', email: 'vet@norte.co', phone: '3001112233', audience: 'veterinaria', topic: 'veterinarias', message: 'Queremos registrarnos como veterinaria' }).expect(201);
    const user = await createUser({ phone: '+573209998877' });
    await contact({ audience: 'comprador', topic: 'cita', message: 'No me llegó la confirmación de la cita' }, user.token).expect(201);
    await contact({ name: 'Otro', email: 'otro@test.co', audience: 'marciano', message: 'Mensaje con audiencia inválida' }).expect(400);
    const fromUser = await SupportMessage.findOne({ where: { userId: user.user.id } });
    expect(fromUser).toMatchObject({ audience: 'comprador', topic: 'cita', phone: '+573209998877', status: 'open' });
  });

  test('listar con filtros, búsqueda y paginación; estadísticas de abiertos', async () => {
    await contact({ name: 'Criadero Andes', email: 'andes@test.co', audience: 'criadero', topic: 'publicacion', message: 'No puedo subir fotos del padre' }).expect(201);
    const all = (await api().get(`${API}/admin/support?status=open&limit=2`).set(auth(admin.token)).expect(200)).body.data;
    expect(all.meta).toMatchObject({ total: 3, totalPages: 2 });
    expect(all.items[0]).toEqual(expect.objectContaining({
      id: expect.any(String), name: expect.any(String), email: expect.any(String), audience: expect.any(String),
      topic: expect.any(String), status: 'open', note: null, replies: [],
    }));
    const vets = (await api().get(`${API}/admin/support?audience=veterinaria`).set(auth(admin.token))).body.data.items;
    expect(vets.map((m) => m.name)).toEqual(['Vet Norte']);
    const search = (await api().get(`${API}/admin/support?search=fotos`).set(auth(admin.token))).body.data.items;
    expect(search.map((m) => m.name)).toEqual(['Criadero Andes']);
    const comprador = (await api().get(`${API}/admin/support?audience=comprador`).set(auth(admin.token))).body.data.items[0];
    expect(comprador.user).toEqual({ id: expect.any(String), role: 'adopter' });

    const stats = (await api().get(`${API}/admin/support/stats`).set(auth(admin.token)).expect(200)).body.data;
    expect(stats).toEqual({ open: 3, byAudience: { comprador: 1, criadero: 1, particular: 0, veterinaria: 1, otro: 0 } });
  });

  test('responder envía correo (Reply-To al buzón de soporte), guarda la respuesta y puede resolver; nota, resolver y reabrir', async () => {
    const msg = await SupportMessage.findOne({ where: { name: 'Vet Norte' } });
    const res = await api().post(`${API}/admin/support/${msg.id}/reply`).set(auth(admin.token))
      .send({ message: 'Hola, te enviamos el enlace de registro: /veterinarias/registro', resolve: true }).expect(200);
    expect(res.body.data).toMatchObject({ status: 'resolved', emailSent: true, replies: [expect.objectContaining({ message: expect.stringContaining('enlace de registro') })] });
    expect(mails[0]).toMatchObject({ to: 'vet@norte.co', replyTo: 'soporte@puppymarketcol.com' });
    expect(await SupportReply.count({ where: { messageId: msg.id } })).toBe(1);

    const reopened = await api().patch(`${API}/admin/support/${msg.id}`).set(auth(admin.token)).send({ status: 'open', note: 'Volvió a escribir' }).expect(200);
    expect(reopened.body.data).toMatchObject({ status: 'open', note: 'Volvió a escribir', resolvedAt: null });
    await api().patch(`${API}/admin/support/${msg.id}`).set(auth(admin.token)).send({}).expect(400);
  });

  test('permiso `soporte`: con él entra, sin él 403', async () => {
    const soporte = await StaffRole.create({ name: 'Soporte', permissions: ['soporte'] });
    const otro = await StaffRole.create({ name: 'Citas', permissions: ['citas'] });
    const ok = await createUser({ role: 'staff', staffRoleId: soporte.id });
    const no = await createUser({ role: 'staff', staffRoleId: otro.id });
    await api().get(`${API}/admin/support`).set(auth(ok.token)).expect(200);
    await api().get(`${API}/admin/support/stats`).set(auth(no.token)).expect(403);
  });
});
