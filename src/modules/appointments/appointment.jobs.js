const { Op } = require('sequelize');
const env = require('../../config/env');
const { sequelize, Appointment, Pet, Payment, Review } = require('../../models');
const { PAYMENT_EXPIRY_MINUTES, REVIEW_DELAY_DAYS } = require('../../config/business');
const events = require('../notifications/notification.events');
const { localParts, endOfLocalDay } = require('../../utils/time');

const LOCK_KEY = 74202; // pg advisory lock: si hay varias réplicas, solo una procesa a la vez
const HOUR = 3600000;

exports.endOfLocalDay = endOfLocalDay;

// Recordatorio del día del encuentro a ambas partes, para citas confirmadas.
// Desde APPOINTMENT_REMINDER_FROM_HOUR (7 a. m.) cubre todas las del día; antes de esa hora solo las de las próximas
// 3 h, para no mandar correos de madrugada.
const sendReminders = async (now, t) => {
  const endOfDay = endOfLocalDay(now);
  const early = localParts(now).hour < env.APPOINTMENT_REMINDER_FROM_HOUR;
  const until = early ? new Date(Math.min(endOfDay.getTime(), now.getTime() + 3 * HOUR)) : endOfDay;

  const appts = await Appointment.findAll({
    where: { status: 'confirmed', reminderSentAt: null, meetingDate: { [Op.gt]: now, [Op.lte]: until } },
    include: [{ model: Pet, as: 'pet', attributes: ['id', 'name', 'ownerId'], required: true }],
    transaction: t, lock: { level: t.LOCK.UPDATE, of: Appointment }, skipLocked: true,
  });
  for (const appt of appts) {
    const data = { appointmentId: appt.id, petId: appt.pet.id, petName: appt.pet.name, meetingDate: appt.meetingDate };
    await events.notify([
      { userId: appt.adopterId, type: 'appointment.reminder', data },
      { userId: appt.pet.ownerId, type: 'appointment.reminder', data },
    ], t);
    await appt.update({ reminderSentAt: now }, { transaction: t });
  }
  return appts.length;
};

// Pendientes cuya fecha ya pasó sin que el vendedor confirmara: se cancelan y la mascota vuelve a estar disponible
const expirePending = async (now, t) => {
  const appts = await Appointment.findAll({
    // Mientras hay una propuesta de otro horario, la que vence es la fecha propuesta
    where: {
      status: 'pending',
      [Op.and]: [sequelize.where(sequelize.fn('COALESCE', sequelize.col('proposedMeetingDate'), sequelize.col('meetingDate')), { [Op.lte]: now })],
    },
    include: [{ model: Pet, as: 'pet', attributes: ['id', 'name', 'ownerId'], required: true }],
    transaction: t, lock: { level: t.LOCK.UPDATE, of: Appointment }, skipLocked: true,
  });
  for (const appt of appts) {
    const data = {
      appointmentId: appt.id, petId: appt.pet.id, petName: appt.pet.name, meetingDate: appt.proposedMeetingDate || appt.meetingDate,
    };
    await appt.update({ status: 'cancelled', cancelledBy: null, cancellationReason: 'expired', proposedMeetingDate: null, proposedAt: null }, { transaction: t });
    await Pet.update({ status: 'available' }, { where: { id: appt.petId, status: 'in_process' }, transaction: t });
    await require('../payments/payment.service').flagRefundIfPaid(appt.id, 'La cita venció sin confirmarse', t);
    await events.notify([
      { userId: appt.adopterId, type: 'appointment.expired', data },
      { userId: appt.pet.ownerId, type: 'appointment.expired', data },
    ], t);
  }
  return appts.length;
};

// Confirmadas que pasaron hace más de APPOINTMENT_OVERDUE_HOURS sin cerrarse: un aviso (una sola vez) al vendedor
const flagOverdue = async (now, t) => {
  const appts = await Appointment.findAll({
    where: {
      status: 'confirmed', overdueNotifiedAt: null,
      meetingDate: { [Op.lte]: new Date(now.getTime() - env.APPOINTMENT_OVERDUE_HOURS * HOUR) },
    },
    include: [{ model: Pet, as: 'pet', attributes: ['id', 'name', 'ownerId'], required: true }],
    transaction: t, lock: { level: t.LOCK.UPDATE, of: Appointment }, skipLocked: true,
  });
  for (const appt of appts) {
    const data = { appointmentId: appt.id, petId: appt.pet.id, petName: appt.pet.name, meetingDate: appt.meetingDate };
    await events.notify([{ userId: appt.pet.ownerId, type: 'appointment.overdue', data }], t);
    await appt.update({ overdueNotifiedAt: now }, { transaction: t });
  }
  return appts.length;
};

// Reservas que esperan pago y no se pagaron a tiempo (+5 min de gracia por si el webhook viene en camino):
// se cancelan, el pago queda vencido y la mascota sigue disponible
const expireUnpaid = async (now, t) => {
  const limit = new Date(now.getTime() - (PAYMENT_EXPIRY_MINUTES + 5) * 60000);
  const appts = await Appointment.findAll({
    where: { status: 'pending_payment', createdAt: { [Op.lte]: limit } },
    include: [{ model: Pet, as: 'pet', attributes: ['id', 'name'], required: true, paranoid: false }],
    transaction: t, lock: { level: t.LOCK.UPDATE, of: Appointment }, skipLocked: true,
  });
  for (const appt of appts) {
    await appt.update({ status: 'cancelled', cancelledBy: null, cancellationReason: 'payment_expired' }, { transaction: t });
    await Payment.update({ status: 'expired' }, { where: { appointmentId: appt.id, status: 'pending' }, transaction: t });
    await events.notify([{ userId: appt.adopterId, type: 'payment.expired', data: { appointmentId: appt.id, petId: appt.pet.id, petName: appt.pet.name } }], t);
  }
  return appts.length;
};

// Encuesta disponible: citas confirmadas o completadas de hace REVIEW_DELAY_DAYS días o más, sin calificar y sin aviso
const requestReviews = async (now, t) => {
  const appts = await Appointment.findAll({
    where: {
      status: ['confirmed', 'completed'], reviewRequestedAt: null,
      meetingDate: { [Op.lte]: new Date(now.getTime() - REVIEW_DELAY_DAYS * 24 * HOUR) },
    },
    include: [
      { model: Pet, as: 'pet', attributes: ['id', 'name'], required: true, paranoid: false },
      { model: Review, as: 'review', attributes: ['id'], required: false },
    ],
    transaction: t,
  });
  const pending = appts.filter((a) => !a.review);
  for (const appt of pending) {
    await events.notify([{ userId: appt.adopterId, type: 'review.requested', data: { appointmentId: appt.id, petId: appt.pet.id, petName: appt.pet.name } }], t);
  }
  if (appts.length) await Appointment.update({ reviewRequestedAt: now }, { where: { id: appts.map((a) => a.id) }, transaction: t });
  return pending.length;
};

exports.runAppointmentJobs = async (now = new Date()) => {
  const result = await sequelize.transaction(async (t) => {
    const [[{ locked }]] = await sequelize.query('SELECT pg_try_advisory_xact_lock(:key) AS locked',
      { replacements: { key: LOCK_KEY }, transaction: t });
    if (!locked) return { skipped: 'otra-instancia-procesando' };
    return {
      recordatorios: await sendReminders(now, t),
      vencidas: await expirePending(now, t),
      sinCerrar: await flagOverdue(now, t),
      reservasSinPagar: await expireUnpaid(now, t),
      encuestas: await requestReviews(now, t),
    };
  });
  if (result.skipped) return result;
  // El PDF tarda unos segundos: se reintenta fuera de la transacción del job
  result.contratos = await require('../contracts/contract.service').retryPending(3, now.getTime());
  return result;
};
