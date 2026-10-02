const { API, api, auth, resetDb, createUser, createPet, validImage, jpg, uploadedFileExists } = require('./helpers');
const { PetImage } = require('../src/models');

let shelter;
let adopter;
beforeAll(async () => {
  await resetDb();
  shelter = await createUser({ role: 'shelter', isVerified: true });
  adopter = await createUser({ role: 'adopter' });
});

describe('Publicar mascota (galería + padres)', () => {
  test('crea con 2 fotos + madre + padre; portada = primera de la galería', async () => {
    const res = await createPet(shelter.token, {}, { gallery: 2 });
    expect(res.status).toBe(201);
    const pet = res.body.data;
    expect(pet.images.map((i) => i.kind)).toEqual(['gallery', 'gallery', 'mother', 'father']);
    expect(pet.imageUrl).toBe(pet.images[0].url);
    expect(pet.owner).toMatchObject({ role: 'shelter', isVerified: true });
    pet.images.forEach((i) => expect(uploadedFileExists(i.url)).toBe(true));
  });

  test('faltan madre/padre/galería → 400 con detalle por campo', async () => {
    const res = await createPet(shelter.token, {}, { gallery: 0, mother: false, father: false });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toEqual(['gallery', 'motherPhoto', 'fatherPhoto']);
  });

  test('más de 3 fotos de galería, campo "image" viejo o archivo falso → 400', async () => {
    expect((await createPet(shelter.token, {}, { gallery: 4 })).status).toBe(400);
    const legacy = await api().post(`${API}/pets`).set(auth(shelter.token)).field('name', 'X')
      .attach('image', await validImage(), jpg('x'));
    expect(legacy.status).toBe(400);
    const fake = await createPet(shelter.token, {}, { buffer: Buffer.from('no soy una imagen') });
    expect(fake.status).toBe(400);
    expect(fake.body.error.message).toMatch(/inválida o está corrupta/);
  });

  test('las imágenes se guardan como WebP de máximo 1600px', async () => {
    const sharp = require('sharp');
    const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#123456' } }).jpeg().toBuffer();
    const res = await createPet(shelter.token, {}, { buffer: big });
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '../public/uploads', path.basename(res.body.data.imageUrl));
    const meta = await sharp(fs.readFileSync(file)).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width, meta.height)).toBe(1600);
  });

  test('roles: adopter no puede publicar; individual sí; adopción no puede tener precio', async () => {
    expect((await createPet(adopter.token)).status).toBe(403);
    const individual = await createUser({ role: 'individual' });
    expect((await createPet(individual.token)).status).toBe(201);
    expect((await createPet(shelter.token, { adoptionType: 'adoption', price: 1000 })).status).toBe(400);
  });
});

describe('Consultar, editar y eliminar', () => {
  test('listado expone owner.isVerified y filtra por ciudad/raza', async () => {
    await createPet(shelter.token, { name: 'Toby', breed: 'Pug', city: 'Pereira' });
    const res = await api().get(`${API}/pets?city=pereira&breed=pug`).expect(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].owner).toEqual(expect.objectContaining({ isVerified: true }));
    expect(res.body.data.items[0].owner.suspendedAt).toBeUndefined(); // no se filtra el campo interno
  });

  test('editar: gallery reemplaza toda la galería y borra los archivos viejos; madre se reemplaza sola', async () => {
    const pet = (await createPet(shelter.token, {}, { gallery: 3 })).body.data;
    const oldGallery = pet.images.filter((i) => i.kind === 'gallery');
    const oldMother = pet.images.find((i) => i.kind === 'mother');

    const res = await api().patch(`${API}/pets/${pet.id}`).set(auth(shelter.token))
      .field('name', 'Luna Editada').attach('gallery', await validImage(), jpg('nueva')).expect(200);
    expect(res.body.data.name).toBe('Luna Editada');
    expect(res.body.data.images.map((i) => i.kind)).toEqual(['gallery', 'mother', 'father']);
    expect(res.body.data.images.find((i) => i.kind === 'mother').url).toBe(oldMother.url);
    oldGallery.forEach((i) => expect(uploadedFileExists(i.url)).toBe(false));
    expect(res.body.data.imageUrl).toBe(res.body.data.images[0].url);
  });

  test('solo el dueño edita o elimina', async () => {
    const pet = (await createPet(shelter.token)).body.data;
    await api().patch(`${API}/pets/${pet.id}`).set(auth(adopter.token)).field('name', 'X').expect(403);
    await api().delete(`${API}/pets/${pet.id}`).set(auth(adopter.token)).expect(403);
  });

  test('eliminar borra la mascota, sus filas de imágenes y los archivos', async () => {
    const pet = (await createPet(shelter.token)).body.data;
    await api().delete(`${API}/pets/${pet.id}`).set(auth(shelter.token)).expect(204);
    await api().get(`${API}/pets/${pet.id}`).expect(404);
    expect(await PetImage.count({ where: { petId: pet.id } })).toBe(0);
    pet.images.forEach((i) => expect(uploadedFileExists(i.url)).toBe(false));
  });

  test('GET /pets/mine y UUID inválido', async () => {
    const res = await api().get(`${API}/pets/mine`).set(auth(shelter.token)).expect(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    await api().get(`${API}/pets/no-es-uuid`).expect(400);
  });
});
