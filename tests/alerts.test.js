const { API, api, auth, resetDb, createUser, createPet, captureMail } = require('./helpers');
const { Pet, User } = require('../src/models');
const mailer = require('../src/utils/mailer');
const { runSearchAlertsDigest } = require('../src/modules/alerts/alert.digest');

let buyer;
let seller;
beforeAll(async () => {
  await resetDb();
  buyer = await createUser({ fullName: 'Ana Compradora' });
  seller = await createUser({ role: 'breeder', isVerified: true });
});

describe('CRUD de alertas', () => {
  test('requiere sesión y al menos un filtro; valida el rango de precio', async () => {
    await api().post(`${API}/alerts`).send({ breed: 'Beagle' }).expect(401);
    await api().post(`${API}/alerts`).set(auth(buyer.token)).send({}).expect(400);
    const r = await api().post(`${API}/alerts`).set(auth(buyer.token)).send({ minPrice: 500, maxPrice: 100 }).expect(400);
    expect(r.body.error.details[0].field).toBe('body.minPrice');
  });

  test('crear, listar y borrar (solo las propias)', async () => {
    const created = await api().post(`${API}/alerts`).set(auth(buyer.token)).send({ city: 'Tunja' }).expect(201);
    const list = await api().get(`${API}/alerts`).set(auth(buyer.token)).expect(200);
    expect(list.body.data.map((a) => a.id)).toContain(created.body.data.id);
    await api().delete(`${API}/alerts/${created.body.data.id}`).set(auth(seller.token)).expect(404);
    await api().delete(`${API}/alerts/${created.body.data.id}`).set(auth(buyer.token)).expect(204);
  });

  test('máximo 10 alertas por usuario', async () => {
    const u = await createUser();
    for (let i = 0; i < 10; i += 1) await api().post(`${API}/alerts`).set(auth(u.token)).send({ city: `Ciudad${i}` }).expect(201);
    await api().post(`${API}/alerts`).set(auth(u.token)).send({ city: 'Una más' }).expect(409);
  });
});

describe('Job de alertas (digest)', () => {
  test('sin SMTP no corre', async () => {
    jest.spyOn(mailer, 'isConfigured').mockReturnValue(false);
    expect(await runSearchAlertsDigest()).toEqual({ skipped: 'smtp-no-configurado' });
    jest.restoreAllMocks();
  });

  test('envía solo lo que coincide, respeta el cooldown y acumula para el siguiente correo', async () => {
    const mails = captureMail();
    await api().post(`${API}/alerts`).set(auth(buyer.token))
      .send({ breed: 'beagle', city: 'cali', maxPrice: 2000000, adoptionType: 'sale' }).expect(201);

    await createPet(seller.token, { name: 'Coincide1', breed: 'Beagle', price: 1500000 });
    await createPet(seller.token, { name: 'Coincide2', breed: 'Beagle mini', price: 1800000 });
    await createPet(seller.token, { name: 'MuyCara', breed: 'Beagle', price: 3500000 });
    await createPet(seller.token, { name: 'OtraRaza', breed: 'Pug', price: 1000000 });
    await createPet(seller.token, { name: 'OtraCiudad', breed: 'Beagle', city: 'Bogotá', price: 1000000 });
    const sold = await createPet(seller.token, { name: 'Vendida', breed: 'Beagle', price: 1000000 });
    await Pet.update({ status: 'adopted' }, { where: { id: sold.body.data.id } });
    // Publicación del propio comprador: nunca se le avisa
    const buyerSeller = await User.findByPk(buyer.user.id);
    await buyerSeller.update({ role: 'individual' });
    await createPet(buyer.token, { name: 'Propia', breed: 'Beagle', price: 1000000 });

    const first = await runSearchAlertsDigest();
    expect(first.enviadas).toBe(1);
    const alertMails = mails.filter((m) => m.subject.includes('alerta'));
    expect(alertMails).toHaveLength(1);
    const html = alertMails[0].html;
    expect(html).toContain('Coincide1');
    expect(html).toContain('Coincide2');
    ['MuyCara', 'OtraRaza', 'OtraCiudad', 'Vendida', 'Propia'].forEach((n) => expect(html).not.toContain(n));
    expect(html).toContain('https://puppymarketcol.com/buscar?breed=beagle&amp;city=cali');

    // Segunda corrida inmediata: en cooldown, no envía
    await createPet(seller.token, { name: 'Coincide3', breed: 'Beagle', price: 1000000 });
    expect((await runSearchAlertsDigest()).enviadas).toBe(0);

    // 25 h después: envía SOLO la nueva acumulada
    const later = new Date(Date.now() + 25 * 3600000);
    expect((await runSearchAlertsDigest(later)).enviadas).toBe(1);
    const last = mails.filter((m) => m.subject.includes('alerta')).pop().html;
    expect(last).toContain('Coincide3');
    expect(last).not.toContain('Coincide1');
  });

  test('no avisa de publicaciones de cuentas suspendidas', async () => {
    const mails = captureMail();
    const u = await createUser();
    const bad = await createUser({ role: 'breeder' });
    await api().post(`${API}/alerts`).set(auth(u.token)).send({ breed: 'Akita' }).expect(201);
    await createPet(bad.token, { name: 'DeSuspendido', breed: 'Akita' });
    await User.update({ suspendedAt: new Date() }, { where: { id: bad.user.id } });

    await runSearchAlertsDigest(new Date(Date.now() + 60 * 86400000));
    expect(mails.some((m) => m.to === u.user.email)).toBe(false);
  });
});
