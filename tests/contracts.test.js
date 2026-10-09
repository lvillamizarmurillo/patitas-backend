// Punto 1: contrato PDF con reintentos, aviso "¡Entrega completada!" cuando ya existe y aviso si falla definitivamente
const { resetDb, createUser, createPet, captureMail } = require('./helpers');
const { Appointment, Contract, Notification } = require('../src/models');
const pdf = require('../src/modules/contracts/pdf.service');
const contracts = require('../src/modules/contracts/contract.service');

let seller;
let buyer;
let admin;
beforeAll(async () => {
  await resetDb();
  seller = await createUser({ role: 'breeder' });
  buyer = await createUser();
  admin = await createUser({ role: 'admin' });
});
beforeEach(() => {
  jest.restoreAllMocks();
  captureMail();
});

const completed = async () => {
  const pet = (await createPet(seller.token)).body.data;
  return Appointment.create({
    petId: pet.id, clinicId: pet.clinics[0].id, adopterId: buyer.user.id, status: 'completed',
    meetingDate: new Date(Date.now() - 3600000), paymentOption: 'commission',
  });
};
const types = async (u, appointmentId) => (await Notification.findAll({ where: { userId: u.user.id, data: { appointmentId } } })).map((n) => n.type);

describe('Contrato', () => {
  test('al generarse avisa "¡Entrega completada!" al comprador; el PDF lleva el desglose del pago', async () => {
    let html;
    jest.spyOn(pdf, 'htmlToPdf').mockImplementation(async (h) => { html = h; return Buffer.from('%PDF-1.4 prueba'); });
    const appt = await completed();
    await contracts.attempt(appt.id);
    expect(await Contract.findOne({ where: { appointmentId: appt.id } })).toBeTruthy();
    expect(await types(buyer, appt.id)).toEqual(['appointment.completed']);
    expect(html).toContain('Precio del vendedor: $1.500.000');
    expect(html).toContain('Comisión de la plataforma: $255.000');
  });

  test('si falla, cuenta intentos; el reintento espera (backoff) y a los 5 avisa al comprador, al vendedor y al admin', async () => {
    jest.spyOn(pdf, 'htmlToPdf').mockRejectedValue(new Error('Chromium no disponible'));
    const appt = await completed();
    await contracts.attempt(appt.id);
    expect((await Appointment.findByPk(appt.id)).contractAttempts).toBe(1);
    expect(await contracts.retryPending(3, Date.now())).toBe(0); // todavía no le toca (2 min de espera)

    for (let i = 0; i < 4; i += 1) await contracts.attempt(appt.id);
    const final = await Appointment.findByPk(appt.id);
    expect(final.contractAttempts).toBe(5);
    expect(final.contractFailedNotifiedAt).not.toBeNull();
    expect(await types(seller, appt.id)).toEqual(['contract.failed']);
    expect(await types(admin, appt.id)).toEqual(['contract.failed']);
    const buyerN = await Notification.findOne({ where: { userId: buyer.user.id, data: { appointmentId: appt.id } } });
    expect(buyerN).toMatchObject({ type: 'appointment.completed', data: expect.objectContaining({ contractDelayed: true }) });

    await contracts.attempt(appt.id); // un fallo más no repite los avisos
    expect(await types(seller, appt.id)).toEqual(['contract.failed']);
  });

  test('retryPending recoge citas completadas que nunca se intentaron (p. ej. reinicio del servidor)', async () => {
    jest.spyOn(pdf, 'htmlToPdf').mockResolvedValue(Buffer.from('%PDF-1.4'));
    const appt = await completed();
    expect(await contracts.retryPending(3, Date.now())).toBe(0); // espera 5 min
    expect(await contracts.retryPending(3, Date.now() + 6 * 60000)).toBe(1);
    expect(await Contract.findOne({ where: { appointmentId: appt.id } })).toBeTruthy();
  });
});
