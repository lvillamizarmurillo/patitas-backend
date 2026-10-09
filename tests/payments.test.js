// Punto 13: pago en línea con Wompi (reserva por comisión o pago completo), webhook, vencimiento, devoluciones y desembolsos
// Las credenciales de prueba se definen antes de cargar la app (env.js se lee una vez por archivo de tests)
Object.assign(process.env, {
  WOMPI_PUBLIC_KEY: 'pub_test_abc123', WOMPI_INTEGRITY_SECRET: 'test_integrity_secret', WOMPI_EVENTS_SECRET: 'test_events_secret',
});
const crypto = require('crypto');
const { API, api, auth, resetDb, createUser, createPet, captureMail, book } = require('./helpers');
const { Appointment, Payment, Payout, Pet, Notification } = require('../src/models');
const { runAppointmentJobs } = require('../src/modules/appointments/appointment.jobs');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Evento de Wompi firmado igual que lo firma Wompi
const wompiEvent = (payment, status, { amountInCents, secret = 'test_events_secret' } = {}) => {
  const transaction = {
    id: `tx-${crypto.randomBytes(4).toString('hex')}`, status, reference: payment.reference, currency: 'COP',
    amount_in_cents: amountInCents ?? Math.round(Number(payment.amount) * 100),
  };
  const timestamp = Math.floor(Date.now() / 1000);
  const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const checksum = sha256(`${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}${secret}`);
  return { event: 'transaction.updated', data: { transaction }, environment: 'test', signature: { properties, checksum }, timestamp };
};
const webhook = (body) => api().post(`${API}/payments/webhooks/wompi`).send(body);

let seller;
let buyer;
let mails;
beforeAll(async () => {
  await resetDb();
  seller = await createUser({ role: 'breeder', fullName: 'Criadero Sol' });
  buyer = await createUser({ fullName: 'Ana Compradora', email: 'ana.compradora@test.com' });
});
beforeEach(() => {
  jest.restoreAllMocks();
  mails = captureMail();
  jest.spyOn(require('../src/queue/contract-queue'), 'enqueueContractGeneration').mockImplementation(() => {});
});

const newPet = async (price = 1500000) => (await createPet(seller.token, { price })).body.data;
const reserve = async (option, pet) => {
  const p = pet || await newPet();
  const res = await book(buyer.token, p, { paymentOption: option }).expect(201);
  return { pet: p, appt: res.body.data, payment: await Payment.findOne({ where: { appointmentId: res.body.data.id } }) };
};

describe('Reserva con pago en línea', () => {
  test('commission: cobra solo la comisión; checkoutUrl de Wompi con firma de integridad válida', async () => {
    const { appt, payment, pet } = await reserve('commission');
    expect(appt.status).toBe('pending_payment');
    expect(appt.payment).toMatchObject({ option: 'commission', amount: 255000, sellerPrice: 1500000, commission: 255000, status: 'pending' });
    expect(appt.pricing).toEqual({ option: 'commission', sellerPrice: 1500000, commission: 255000, amount: 255000, payAtMeeting: 1500000 });

    const url = new URL(appt.payment.checkoutUrl);
    expect(url.origin + url.pathname).toBe('https://checkout.wompi.co/p/');
    const q = url.searchParams;
    expect(q.get('public-key')).toBe('pub_test_abc123');
    expect(q.get('amount-in-cents')).toBe('25500000');
    expect(q.get('reference')).toBe(payment.reference);
    expect(q.get('redirect-url')).toBe(`https://puppymarketcol.com/citas?id=${appt.id}`);
    expect(q.get('signature:integrity')).toBe(sha256(`${payment.reference}25500000COP${q.get('expiration-time')}test_integrity_secret`));

    // Mientras espera el pago: la mascota sigue publicada y el vendedor no ve la cita
    expect((await api().get(`${API}/pets/${pet.id}`)).body.data.status).toBe('available');
    await api().get(`${API}/appointments/${appt.id}`).set(auth(seller.token)).expect(404);
    const sellerList = (await api().get(`${API}/appointments`).set(auth(seller.token))).body.data.items;
    expect(sellerList.find((a) => a.id === appt.id)).toBeUndefined();
    expect(await Notification.count({ where: { userId: seller.user.id } })).toBe(0);
  });

  test('full: cobra precio + comisión; nadie más puede reservar mientras tanto; reintentar reemplaza la reserva', async () => {
    const { appt, pet } = await reserve('full');
    expect(appt.payment.amount).toBe(1755000);
    const other = await createUser();
    const busy = await book(other.token, pet).expect(409);
    expect(busy.body.error.message).toContain('Otra persona está reservando');

    const retry = await book(buyer.token, pet, { paymentOption: 'commission' }).expect(201);
    expect((await Appointment.findByPk(appt.id)).cancellationReason).toBe('payment_restarted');
    expect((await Payment.findOne({ where: { appointmentId: appt.id } })).status).toBe('expired');
    expect(retry.body.data.payment.amount).toBe(255000);
  });
});

describe('Webhook', () => {
  test('firma inválida → 401; aprobado → cita por confirmar, mascota en proceso y aviso al vendedor con el desglose', async () => {
    const { appt, payment, pet } = await reserve('commission');
    await webhook(wompiEvent(payment, 'APPROVED', { secret: 'otro' })).expect(401);
    await webhook({ event: 'transaction.updated' }).expect(401);

    await webhook(wompiEvent(payment, 'APPROVED')).expect(200);
    expect((await Appointment.findByPk(appt.id)).status).toBe('pending');
    expect((await Pet.findByPk(pet.id)).status).toBe('in_process');
    expect((await Payment.findByPk(payment.id))).toMatchObject({ status: 'approved' });
    const n = await Notification.findOne({ where: { userId: seller.user.id, type: 'appointment.created', data: { appointmentId: appt.id } } });
    expect(n.data).toMatchObject({ paymentOption: 'commission', payAtMeeting: 1500000 });
    const dto = (await api().get(`${API}/notifications`).set(auth(seller.token))).body.data.items[0];
    expect(dto.message).toContain('le paga $1.500.000 al vendedor');
    await api().get(`${API}/appointments/${appt.id}`).set(auth(seller.token)).expect(200); // ahora sí la ve

    // Reenvío del mismo evento: idempotente
    const again = await webhook(wompiEvent(payment, 'APPROVED')).expect(200);
    expect(again.body.data).toEqual({ duplicated: true });
    expect(await Notification.count({ where: { userId: seller.user.id, type: 'appointment.created' } })).toBe(1);
  });

  test('monto distinto → se ignora y queda marcado; rechazado → la reserva se cancela y se avisa al comprador', async () => {
    const r1 = await reserve('commission');
    await webhook(wompiEvent(r1.payment, 'APPROVED', { amountInCents: 100 })).expect(200);
    expect((await Appointment.findByPk(r1.appt.id)).status).toBe('pending_payment');
    expect((await Payment.findByPk(r1.payment.id)).refundStatus).toBe('required');

    const r2 = await reserve('full');
    await webhook(wompiEvent(r2.payment, 'DECLINED')).expect(200);
    expect(await Appointment.findByPk(r2.appt.id)).toMatchObject({ status: 'cancelled', cancellationReason: 'payment_declined' });
    expect((await Payment.findByPk(r2.payment.id)).status).toBe('declined');
    expect(await Notification.findOne({ where: { userId: buyer.user.id, type: 'payment.declined' } })).toBeTruthy();
  });
});

describe('Vencimiento, devoluciones y desembolsos', () => {
  test('sin pago en 30 min (+5 de gracia) se cancela sola; si el pago llega tarde queda para devolución', async () => {
    const { appt, payment } = await reserve('commission');
    await runAppointmentJobs(new Date(Date.now() + 20 * 60000));
    expect((await Appointment.findByPk(appt.id)).status).toBe('pending_payment');
    const r = await runAppointmentJobs(new Date(Date.now() + 36 * 60000));
    expect(r.reservasSinPagar).toBeGreaterThanOrEqual(1); // también vence las reservas sin pagar de los tests anteriores
    expect(await Appointment.findByPk(appt.id)).toMatchObject({ status: 'cancelled', cancellationReason: 'payment_expired' });
    expect((await Payment.findByPk(payment.id)).status).toBe('expired');
    expect(await Notification.findOne({ where: { userId: buyer.user.id, type: 'payment.expired' } })).toBeTruthy();

    const late = await webhook(wompiEvent(payment, 'APPROVED')).expect(200);
    expect(late.body.data).toEqual({ status: 'approved', refundRequired: true });
    expect(await Payment.findByPk(payment.id)).toMatchObject({ status: 'approved', refundStatus: 'required' });
  });

  test('el vendedor no puede borrar la mascota mientras alguien paga la reserva', async () => {
    const { pet } = await reserve('commission');
    const res = await api().delete(`${API}/pets/${pet.id}`).set(auth(seller.token)).expect(409);
    expect(res.body.error.message).toContain('en proceso de pago');
  });

  test('cancelar una cita ya pagada la marca para devolución (política pendiente de producto)', async () => {
    const { appt, payment } = await reserve('commission');
    await webhook(wompiEvent(payment, 'APPROVED')).expect(200);
    await api().patch(`${API}/appointments/${appt.id}/status`).set(auth(buyer.token)).send({ status: 'cancelled' }).expect(200);
    expect((await Payment.findByPk(payment.id)).refundStatus).toBe('required');
  });

  test('pago completo + cita completada → desembolso pendiente al vendedor; el admin lo marca pagado', async () => {
    const admin = await createUser({ role: 'admin' });
    const { appt, payment } = await reserve('full');
    await webhook(wompiEvent(payment, 'APPROVED')).expect(200);
    const set = (s) => api().patch(`${API}/appointments/${appt.id}/status`).set(auth(seller.token)).send({ status: s }).expect(200);
    await set('confirmed');
    await set('completed');
    const payout = await Payout.findOne({ where: { paymentId: payment.id } });
    expect(payout).toMatchObject({ sellerId: seller.user.id, status: 'pending' });
    expect(Number(payout.amount)).toBe(1500000);

    // Datos de pago del vendedor
    await api().put(`${API}/auth/me/payout-info`).set(auth(seller.token)).send({ method: 'bank', accountNumber: '123' }).expect(400);
    const info = { method: 'bank', bankName: 'Bancolombia', accountType: 'ahorros', accountNumber: '12345678901', holderName: 'Criadero Sol SAS', holderDocument: '900123456-1' };
    await api().put(`${API}/auth/me/payout-info`).set(auth(seller.token)).send(info).expect(200);
    expect((await api().get(`${API}/auth/me/payout-info`).set(auth(seller.token))).body.data).toEqual(info);
    await api().get(`${API}/auth/me/payout-info`).set(auth(buyer.token)).expect(403);
    expect((await api().get(`${API}/auth/me`).set(auth(seller.token))).body.data.payoutInfo).toBeUndefined();

    const list = (await api().get(`${API}/admin/payouts?status=pending`).set(auth(admin.token)).expect(200)).body.data;
    expect(list.items[0]).toMatchObject({ amount: 1500000, seller: expect.objectContaining({ payoutInfo: info }) });
    await api().patch(`${API}/admin/payouts/${payout.id}/paid`).set(auth(admin.token)).send({ transferReference: 'TRF-001' }).expect(200);
    await api().patch(`${API}/admin/payouts/${payout.id}/paid`).set(auth(admin.token)).send({ transferReference: 'TRF-001' }).expect(409);

    const payments = (await api().get(`${API}/admin/payments?refundStatus=required`).set(auth(admin.token)).expect(200)).body.data;
    expect(payments.items.length).toBeGreaterThan(0);
    const toRefund = payments.items[0];
    await api().patch(`${API}/admin/payments/${toRefund.id}/refund`).set(auth(admin.token)).send({ refundStatus: 'refunded', refundNote: 'Devuelto en Wompi' }).expect(200);
    expect((await Payment.findByPk(toRefund.id)).status).toBe('refunded');
  });
});

describe('Sin pasarela configurada', () => {
  test('la cita queda pedida sin checkoutUrl y guarda la opción elegida', async () => {
    const svc = require('../src/modules/payments/payment.service');
    jest.spyOn(svc, 'isOnlinePaymentEnabled').mockReturnValue(false);
    const pet = await newPet();
    const res = await book(buyer.token, pet, { paymentOption: 'full' }).expect(201);
    expect(res.body.data).toMatchObject({ status: 'pending', payment: null, paymentOption: 'full' });
    expect(res.body.data.pricing.amount).toBe(1755000);
    expect((await Pet.findByPk(pet.id)).status).toBe('in_process');
  });
});
