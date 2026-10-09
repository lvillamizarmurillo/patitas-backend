const crypto = require('crypto');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { commissionOf, publicPriceOf, PAYMENT_EXPIRY_MINUTES } = require('../../config/business');
const { sequelize, Payment, Payout, Appointment, Pet, User } = require('../../models');
const AppError = require('../../utils/AppError');
const provider = require('../../providers/payments/wompi.provider');
const events = require('../notifications/notification.events');

exports.isOnlinePaymentEnabled = provider.isEnabled;

const toPaymentDTO = (p) => (p ? {
  id: p.id, option: p.option, amount: Number(p.amount), sellerPrice: Number(p.sellerPrice), commission: Number(p.commission),
  currency: p.currency, status: p.status, checkoutUrl: p.status === 'pending' ? p.checkoutUrl ?? null : null,
  expiresAt: p.expiresAt, approvedAt: p.approvedAt ?? null, refundStatus: p.refundStatus ?? null,
} : null);
exports.toPaymentDTO = toPaymentDTO;

// Desglose de una venta según la opción de reserva
exports.breakdown = (sellerPrice, option) => {
  const commission = commissionOf(sellerPrice);
  return {
    option, sellerPrice: Number(sellerPrice), commission,
    amount: option === 'full' ? publicPriceOf(sellerPrice) : commission, // lo que se paga en línea
    payAtMeeting: option === 'full' ? 0 : Number(sellerPrice), // lo que el comprador le paga al vendedor en la cita
  };
};

// Crea el pago de una cita de venta (dentro de la transacción de la cita) y la URL de Wompi
exports.createForAppointment = async ({ appointment, pet, buyer, option }, transaction) => {
  const b = exports.breakdown(pet.price, option);
  const reference = `PM-${appointment.id.slice(0, 8)}-${crypto.randomBytes(6).toString('hex')}`;
  const expiresAt = new Date(Date.now() + PAYMENT_EXPIRY_MINUTES * 60000);
  const checkoutUrl = provider.isEnabled()
    ? provider.createCheckout({
      reference, amount: b.amount, expiresAt, customerEmail: buyer.email,
      redirectUrl: `${env.FRONTEND_URL.replace(/\/$/, '')}/citas?id=${appointment.id}`,
    })
    : null;
  return Payment.create({
    appointmentId: appointment.id, buyerId: buyer.id, option, sellerPrice: b.sellerPrice, commission: b.commission,
    amount: b.amount, reference, expiresAt, checkoutUrl, provider: provider.name,
  }, { transaction });
};

// Webhook de la pasarela. Idempotente: Wompi puede reenviar el mismo evento.
exports.handleWebhook = async (body) => {
  if (!provider.isEnabled()) throw AppError.notFound('Pagos en línea deshabilitados');
  if (!provider.verifyEvent(body)) throw AppError.unauthorized('Firma del evento inválida');
  const ev = provider.parseEvent(body);
  if (!ev) return { ignored: true };

  return sequelize.transaction(async (t) => {
    const payment = await Payment.findOne({ where: { reference: ev.reference }, transaction: t, lock: t.LOCK.UPDATE });
    if (!payment) {
      logger.warn({ reference: ev.reference }, 'Webhook de pago con referencia desconocida');
      return { ignored: true };
    }
    if (Math.round(ev.amount * 100) !== Math.round(Number(payment.amount) * 100) || (ev.currency && ev.currency !== payment.currency)) {
      logger.error({ reference: ev.reference, amount: ev.amount }, 'El monto del pago no coincide: se ignora');
      await payment.update({ lastEvent: body, refundStatus: payment.refundStatus || 'required', refundNote: 'Monto distinto al esperado' }, { transaction: t });
      return { ignored: true };
    }
    if (payment.status === 'approved' || payment.status === 'refunded') return { duplicated: true };
    if (ev.status === 'pending') {
      await payment.update({ providerTransactionId: ev.transactionId, lastEvent: body }, { transaction: t });
      return { status: 'pending' };
    }

    const appt = await Appointment.findByPk(payment.appointmentId, { transaction: t, lock: t.LOCK.UPDATE });
    const pet = await Pet.findByPk(appt.petId, { transaction: t, lock: t.LOCK.UPDATE, paranoid: false });

    if (ev.status !== 'approved') {
      // Rechazado/anulado: se libera la reserva para que otro pueda comprar (el comprador puede reintentar)
      await payment.update({ status: ev.status, providerTransactionId: ev.transactionId, lastEvent: body }, { transaction: t });
      if (appt.status === 'pending_payment') {
        await appt.update({ status: 'cancelled', cancelledBy: null, cancellationReason: 'payment_declined' }, { transaction: t });
        await events.notify([{ userId: appt.adopterId, type: 'payment.declined', data: { appointmentId: appt.id, petId: pet.id, petName: pet.name } }], t);
      }
      return { status: ev.status };
    }

    await payment.update({ status: 'approved', approvedAt: new Date(), providerTransactionId: ev.transactionId, lastEvent: body }, { transaction: t });
    if (appt.status !== 'pending_payment' || pet.deletedAt) {
      // Llegó tarde (la reserva ya venció o se canceló): el dinero entró pero no hay cita → hay que devolverlo
      const why = pet.deletedAt ? 'la mascota fue eliminada' : `la cita está en estado ${appt.status}`;
      await payment.update({ refundStatus: 'required', refundNote: `Pago aprobado pero ${why}` }, { transaction: t });
      if (appt.status === 'pending_payment') {
        await appt.update({ status: 'cancelled', cancelledBy: null, cancellationReason: 'pet_unavailable' }, { transaction: t });
      }
      logger.error({ appointmentId: appt.id }, 'Pago aprobado para una cita que ya no esperaba pago: requiere devolución');
      return { status: 'approved', refundRequired: true };
    }

    // Pago aprobado: la cita pasa a "por confirmar", la mascota sale del listado y se avisa al vendedor
    await appt.update({ status: 'pending' }, { transaction: t });
    await pet.update({ status: 'in_process' }, { transaction: t });
    const buyer = await User.findByPk(appt.adopterId, { attributes: ['fullName'], transaction: t });
    await events.appointmentCreated({ appt, pet, adopterName: buyer.fullName, payment }, t);
    return { status: 'approved' };
  });
};

// Cancelación de una cita con pago aprobado: la política de devoluciones está pendiente de producto,
// así que se marca para que el admin la gestione a mano.
exports.flagRefundIfPaid = async (appointmentId, reason, transaction) => {
  const payment = await Payment.findOne({ where: { appointmentId }, transaction });
  if (payment?.status === 'approved' && !payment.refundStatus) {
    await payment.update({ refundStatus: 'required', refundNote: reason }, { transaction });
  }
  if (payment?.status === 'pending') await payment.update({ status: 'expired' }, { transaction });
};

// Al completar una cita pagada con la opción `full`, Puppymarket le debe al vendedor su parte
exports.createPayoutIfNeeded = async (appt, pet, transaction) => {
  const payment = await Payment.findOne({ where: { appointmentId: appt.id, status: 'approved', option: 'full' }, transaction });
  if (!payment) return;
  await Payout.findOrCreate({
    where: { paymentId: payment.id },
    defaults: { appointmentId: appt.id, sellerId: pet.ownerId, amount: payment.sellerPrice },
    transaction,
  });
};
