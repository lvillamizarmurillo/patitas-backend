const { API, api, auth, resetDb, createUser, createPet, createClinic } = require('./helpers');
const { Pet, VetClinic } = require('../src/models');

let seller;
beforeAll(async () => {
  await resetDb();
  seller = await createUser({ role: 'individual' });
});

describe('Catálogos', () => {
  test('filtros solo con razas y ciudades de mascotas disponibles, ordenados', async () => {
    await createPet(seller.token, { breed: 'Pug', city: 'Cali' });
    await createPet(seller.token, { breed: 'Akita', city: 'Armenia' });
    const sold = (await createPet(seller.token, { breed: 'Husky', city: 'Medellín' })).body.data;
    await Pet.update({ status: 'adopted' }, { where: { id: sold.id } });

    const res = await api().get(`${API}/catalogs/filters`).expect(200);
    expect(res.body.data).toEqual({ breeds: ['Akita', 'Pug'], cities: ['Armenia', 'Cali'] });
  });

  test('clínicas activas, filtrables por ciudad', async () => {
    await createClinic({ name: 'Activa', city: 'Girón' });
    await createClinic({ name: 'Deshabilitada', city: 'Girón', isActive: false });
    await createClinic({ name: 'Por revisar', city: 'Girón', status: 'pending', isActive: false });
    const res = await api().get(`${API}/catalogs/clinics?city=Girón`).expect(200);
    expect(res.body.data.map((c) => c.name)).toEqual(['Activa']);
    expect(res.body.data[0]).toEqual(expect.objectContaining({ phone: expect.any(String), schedule: expect.any(Object) }));
  });
});

describe('Favoritos', () => {
  test('agregar (idempotente), listar con owner.isVerified y quitar', async () => {
    const buyer = await createUser();
    const pet = (await createPet(seller.token)).body.data;
    await api().post(`${API}/favorites/${pet.id}`).set(auth(buyer.token)).expect(201);
    await api().post(`${API}/favorites/${pet.id}`).set(auth(buyer.token)).expect(201);
    const list = await api().get(`${API}/favorites`).set(auth(buyer.token)).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].owner).toHaveProperty('isVerified', false);
    await api().delete(`${API}/favorites/${pet.id}`).set(auth(buyer.token)).expect(200);
    expect((await api().get(`${API}/favorites`).set(auth(buyer.token))).body.data).toHaveLength(0);
  });
});

describe('Dashboard', () => {
  test('individual entra (antes daba 403); adopter no', async () => {
    const res = await api().get(`${API}/dashboard`).set(auth(seller.token)).expect(200);
    expect(res.body.data.pets.total).toBeGreaterThan(0);
    const buyer = await createUser();
    await api().get(`${API}/dashboard`).set(auth(buyer.token)).expect(403);
  });
});
