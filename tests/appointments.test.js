const fs = require('fs');
const { API, api, auth, resetDb, createUser, createPet, createClinic, futureDate } = require('./helpers');
const { Contract } = require('../src/models');

let owner;
let adopter;
let clinic;
beforeAll(async () => {
  await resetDb();
  owner = await createUser({ role: 'breeder', isVerified: true });
  adopter = await createUser({ role: 'adopter' });
  clinic = await createClinic();
});

const book = (token, petId, extra = {}) =>
  api().post(`${API}/appointments`).set(auth(token)).send({ petId, clinicId: clinic.id, meetingDate: futureDate(), ...extra });

describe('Citas', () => {
  test('crear: la mascota pasa a in_process y no se puede doble reservar', async () => {
    const pet = (await createPet(owner.token)).body.data;
    await book(adopter.token, pet.id).expect(201);
    expect((await api().get(`${API}/pets/${pet.id}`)).body.data.status).toBe('in_process');

    const other = await createUser();
    await book(other.token, pet.id).expect(409);
  });

  test('validaciones: fecha pasada, mascota propia, clínica inexistente', async () => {
    const pet = (await createPet(owner.token)).body.data;
    await book(adopter.token, pet.id, { meetingDate: new Date().toISOString() }).expect(400);
    await book(owner.token, pet.id).expect(400);
    await book(adopter.token, pet.id, { clinicId: '00000000-0000-4000-8000-000000000000' }).expect(404);
  });

  test('máquina de estados: solo el dueño confirma/completa; cancelar libera la mascota', async () => {
    const pet = (await createPet(owner.token)).body.data;
    const appt = (await book(adopter.token, pet.id).expect(201)).body.data;
    const status = (token, s) => api().patch(`${API}/appointments/${appt.id}/status`).set(auth(token)).send({ status: s });

    await status(adopter.token, 'confirmed').expect(403);
    await status(owner.token, 'completed').expect(409); // pending → completed no existe
    await status(owner.token, 'confirmed').expect(200);
    await status(adopter.token, 'cancelled').expect(200);
    expect((await api().get(`${API}/pets/${pet.id}`)).body.data.status).toBe('available');
    await status(owner.token, 'confirmed').expect(409); // cancelada es final
  });

  test('listado y detalle: cada uno ve solo sus citas', async () => {
    const pet = (await createPet(owner.token)).body.data;
    const appt = (await book(adopter.token, pet.id)).body.data;
    const stranger = await createUser();
    await api().get(`${API}/appointments/${appt.id}`).set(auth(stranger.token)).expect(404);
    await api().get(`${API}/appointments/${appt.id}`).set(auth(owner.token)).expect(200);
    const mine = await api().get(`${API}/appointments`).set(auth(adopter.token)).expect(200);
    expect(mine.body.data.items.every((a) => a.adopterId === adopter.user.id)).toBe(true);
  });

  // Requiere Chromium (presente en la imagen Docker). Fuera de Docker se omite.
  const chromium = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';
  (fs.existsSync(chromium) ? test : test.skip)('completar genera el contrato PDF y solo las partes pueden descargarlo', async () => {
    const pet = (await createPet(owner.token)).body.data;
    const appt = (await book(adopter.token, pet.id)).body.data;
    await api().patch(`${API}/appointments/${appt.id}/status`).set(auth(owner.token)).send({ status: 'confirmed' }).expect(200);
    await api().patch(`${API}/appointments/${appt.id}/status`).set(auth(owner.token)).send({ status: 'completed' }).expect(200);
    expect((await api().get(`${API}/pets/${pet.id}`)).body.data.status).toBe('adopted');

    let contract;
    for (let i = 0; i < 40 && !contract; i += 1) {
      contract = await Contract.findOne({ where: { appointmentId: appt.id } });
      if (!contract) await new Promise((r) => setTimeout(r, 500));
    }
    expect(contract).toBeTruthy();
    expect(contract.sha256).toMatch(/^[0-9a-f]{64}$/);

    const dl = await api().get(`${API}/contracts/${appt.id}`).set(auth(adopter.token)).expect(200);
    expect(dl.body.data).toMatchObject({ contractNumber: contract.contractNumber, expiresIn: 300 });
    const stranger = await createUser();
    await api().get(`${API}/contracts/${appt.id}`).set(auth(stranger.token)).expect(404);
    await api().get(`${API}/contracts/no-es-uuid`).set(auth(adopter.token)).expect(400);
  });
});
