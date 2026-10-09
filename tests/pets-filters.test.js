// Punto 10 (filtros y orden en GET /pets) y 13.1-13.2 (comisión en el DTO)
const { API, api, resetDb, createUser, createPet } = require('./helpers');

let breeder;
let individual;
let shelter;
beforeAll(async () => {
  await resetDb();
  breeder = await createUser({ role: 'breeder', isVerified: true });
  individual = await createUser({ role: 'individual' });
  shelter = await createUser({ role: 'shelter', isVerified: true });
  await createPet(breeder.token, { name: 'Max', breed: 'Golden Retriever', city: 'Cali', ageMonths: 3, price: 1000000 });
  await createPet(breeder.token, { name: 'Lola', breed: 'Pug', city: 'Cali', ageMonths: 10, price: 2000000 });
  await createPet(individual.token, { name: 'Toby', breed: 'Beagle', city: 'Pereira', ageMonths: 30, price: 500000 });
  await createPet(shelter.token, { name: 'Firulais', breed: 'Criollo', city: 'Cali', ageMonths: 48, adoptionType: 'adoption', price: 0 });
});

const names = async (qs) => (await api().get(`${API}/pets?${qs}`).expect(200)).body.data.items.map((p) => p.name);

describe('Comisión', () => {
  test('el DTO trae price (vendedor), commission y publicPrice; adopciones en 0', async () => {
    const items = (await api().get(`${API}/pets?limit=50`)).body.data.items;
    const max = items.find((p) => p.name === 'Max');
    expect(max).toMatchObject({ price: 1000000, commission: 170000, publicPrice: 1170000 });
    expect(items.find((p) => p.name === 'Firulais')).toMatchObject({ price: 0, commission: 0, publicPrice: 0 });
  });

  test('GET /catalogs/pricing expone la tasa para que el frontend no la tenga escrita a mano', async () => {
    const res = await api().get(`${API}/catalogs/pricing`).expect(200);
    expect(res.body.data).toEqual({ commissionRate: 0.17, currency: 'COP', paymentOptions: ['commission', 'full'] });
  });
});

describe('Filtros y orden', () => {
  test('adoptionType', async () => {
    expect(await names('adoptionType=adoption')).toEqual(['Firulais']);
    expect((await names('adoptionType=sale')).sort()).toEqual(['Lola', 'Max', 'Toby']);
  });

  test('precio sobre el precio publicado (con comisión)', async () => {
    // Max: 1.000.000 → publicado 1.170.000. Con minPrice 1.100.000 entra aunque su precio del vendedor sea menor.
    expect((await names('minPrice=1100000&maxPrice=1200000'))).toEqual(['Max']);
    expect((await names('maxPrice=1000000&adoptionType=sale'))).toEqual(['Toby']); // 585.000
    await api().get(`${API}/pets?minPrice=5&maxPrice=1`).expect(400);
  });

  test('edad, texto libre, tipo de vendedor y verificados', async () => {
    expect((await names('minAgeMonths=6&maxAgeMonths=36')).sort()).toEqual(['Lola', 'Toby']);
    expect(await names('q=golden')).toEqual(['Max']);
    expect(await names('q=pereira')).toEqual(['Toby']);
    expect(await names('q=firu')).toEqual(['Firulais']);
    expect(await names('sellerRole=individual')).toEqual(['Toby']);
    expect((await names('verified=true')).sort()).toEqual(['Firulais', 'Lola', 'Max']);
  });

  test('orden por precio y paginación real', async () => {
    expect(await names('adoptionType=sale&sort=price_asc')).toEqual(['Toby', 'Max', 'Lola']);
    expect(await names('adoptionType=sale&sort=price_desc')).toEqual(['Lola', 'Max', 'Toby']);
    const page = (await api().get(`${API}/pets?sort=price_asc&adoptionType=sale&limit=2&page=2`)).body.data;
    expect(page.items.map((p) => p.name)).toEqual(['Lola']);
    expect(page.meta).toMatchObject({ total: 3, totalPages: 2 });
  });

  test('los filtros viejos siguen funcionando', async () => {
    expect(await names('filter=adopcion')).toEqual(['Firulais']);
    expect((await names('filter=cachorros')).sort()).toEqual(['Lola', 'Max']);
    expect((await names('filter=criador')).sort()).toEqual(['Lola', 'Max']);
  });
});
