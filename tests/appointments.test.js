const fs = require('fs');
const { API, api, auth, resetDb, createUser, createPet, createClinic, book, slotFor } = require('./helpers');
const { Contract } = require('../src/models');

let owner;
let adopter;
beforeAll(async () => {
  await resetDb();
  owner = await createUser({ role: 'breeder', isVerified: true });
  adopter = await createUser({ role: 'adopter' });
});

const newPet = async (fields) => (await createPet(owner.token, fields)).body.data;

describe('Citas', () => {
  test('crear: la mascota pasa a in_process y no se puede doble reservar', async () => {
    const pet = await newPet();
    await book(adopter.token, pet).expect(201);
    expect((await api().get(`${API}/pets/${pet.id}`)).body.data.status).toBe('in_process');

    const other = await createUser();
    await book(other.token, pet).expect(409);
  });

  test('validaciones: fecha pasada, mascota propia, veterinaria que no es de la mascota, venta sin paymentOption', async () => {
    const pet = await newPet();
    await book(adopter.token, pet, { meetingDate: new Date().toISOString() }).expect(400);
    await book(owner.token, pet).expect(400);
    const otherClinic = await createClinic({ city: 'Cali' });
    const notTheirs = await book(adopter.token, pet, { clinicId: otherClinic.id }).expect(400);
    expect(notTheirs.body.error.details[0]).toMatchObject({ field: 'body.clinicId' });
    const noOption = await book(adopter.token, pet, { paymentOption: null }).expect(400);
    expect(noOption.body.error.details[0].field).toBe('body.paymentOption');
  });

  test('máquina de estados: solo el dueño confirma/completa; cancelar libera la mascota', async () => {
    const pet = await newPet();
    const appt = (await book(adopter.token, pet).expect(201)).body.data;
    const status = (token, s) => api().patch(`${API}/appointments/${appt.id}/status`).set(auth(token)).send({ status: s });

    await status(adopter.token, 'confirmed').expect(403);
    await status(owner.token, 'completed').expect(409); // pending → completed no existe
    await status(owner.token, 'confirmed').expect(200);
    await status(adopter.token, 'cancelled').expect(200);
    expect((await api().get(`${API}/pets/${pet.id}`)).body.data.status).toBe('available');
    await status(owner.token, 'confirmed').expect(409); // cancelada es final
  });

  test('listado y detalle: cada uno ve solo sus citas; el DTO trae vendedor, horario de la veterinaria y desglose', async () => {
    const pet = await newPet({ price: 1500000 });
    const appt = (await book(adopter.token, pet, { paymentOption: 'commission' })).body.data;
    const stranger = await createUser();
    await api().get(`${API}/appointments/${appt.id}`).set(auth(stranger.token)).expect(404);
    const detail = (await api().get(`${API}/appointments/${appt.id}`).set(auth(owner.token)).expect(200)).body.data;
    expect(detail.seller).toEqual({ id: owner.user.id, fullName: owner.user.fullName });
    expect(detail.clinic.schedule).toBeTruthy();
    expect(detail.proposal).toBeNull();
    expect(detail.pricing).toEqual({ option: 'commission', sellerPrice: 1500000, commission: 255000, amount: 255000, payAtMeeting: 1500000 });
    const mine = await api().get(`${API}/appointments`).set(auth(adopter.token)).expect(200);
    expect(mine.body.data.items.every((a) => a.adopterId === adopter.user.id)).toBe(true);
  });

  // Requiere Chromium (presente en la imagen Docker). Fuera de Docker se omite.
  const chromium = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';
  (fs.existsSync(chromium) ? test : test.skip)('completar genera el contrato PDF y solo las partes pueden descargarlo', async () => {
    const pet = await newPet();
    const appt = (await book(adopter.token, pet)).body.data;
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

  test('una adopción no pide paymentOption', async () => {
    const pet = await newPet({ adoptionType: 'adoption', price: 0 });
    const res = await book(adopter.token, pet).expect(201);
    expect(res.body.data).toMatchObject({ status: 'pending', paymentOption: null, pricing: null });
  });

  test('slotFor encuentra horarios', () => {
    expect(slotFor()).toEqual(expect.any(String));
  });
});
