const { Op } = require('sequelize');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { Notification, Favorite, User, VetClinic } = require('../../models');
const mailer = require('../../utils/mailer');
const { escapeHtml } = require('../../utils/escape');
const { render, wantsEmail } = require('./notification.messages');

// Correos de las notificaciones importantes. Solo con SMTP, nunca a cuentas suspendidas y sin bloquear la petición.
const sendEmails = async (items) => {
  if (!mailer.isConfigured() || !items.length) return;
  const users = await User.findAll({
    where: { id: [...new Set(items.map((i) => i.userId))], suspendedAt: null }, attributes: ['id', 'email', 'fullName'],
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  await Promise.all(items.map(async ({ userId, type, data }) => {
    const user = byId.get(userId);
    if (!user) return;
    const { title, message } = render(type, data);
    await mailer.send({
      to: user.email,
      subject: `${title} — ${env.APP_NAME}`,
      html: `<p>Hola ${escapeHtml(user.fullName)},</p><p>${escapeHtml(message)}</p>
        <p><a href="${escapeHtml(env.FRONTEND_URL)}">Ir a ${escapeHtml(env.APP_NAME)}</a></p>`,
    }).catch((err) => logger.warn({ err, type }, 'No se pudo enviar el correo de la notificación'));
  }));
};

// Crea las notificaciones dentro de la transacción del evento (si el evento se revierte, no quedan avisos falsos)
// y deja los correos para después del commit.
const notify = async (items, transaction) => {
  const list = items.filter((i) => i.userId);
  if (!list.length) return;
  await Notification.bulkCreate(list.map(({ userId, type, data }) => ({ userId, type, data })), { transaction });
  const emails = list.filter((i) => wantsEmail(i.type));
  if (!emails.length) return;
  const send = () => sendEmails(emails).catch((err) => logger.warn({ err }, 'Falló el envío de correos de notificaciones'));
  if (transaction) transaction.afterCommit(send);
  else send();
};
exports.notify = notify;

const apptData = async (appt, pet, transaction, extra = {}) => {
  const clinic = await VetClinic.findByPk(appt.clinicId, { attributes: ['name'], transaction });
  return {
    appointmentId: appt.id, petId: pet.id, petName: pet.name, meetingDate: appt.meetingDate,
    clinicName: clinic?.name ?? null, ...extra,
  };
};

// Quienes tienen la mascota en favoritos, sin contar a las partes de la cita
const favoritersOf = async (petId, exclude, transaction) => {
  const favs = await Favorite.findAll({
    where: { petId, userId: { [Op.notIn]: exclude } }, attributes: ['userId'], transaction,
  });
  return favs.map((f) => f.userId);
};

// Desglose del pago para los textos y correos de la cita (13.7)
const paymentData = (pet, option) => {
  if (pet.adoptionType !== 'sale' || !option) return {};
  const { breakdown } = require('../payments/payment.service');
  const b = breakdown(pet.price, option);
  return { paymentOption: option, amountPaid: b.amount, payAtMeeting: b.payAtMeeting };
};

exports.appointmentCreated = async ({ appt, pet, adopterName, payment }, transaction) => {
  const data = await apptData(appt, pet, transaction, { adopterName, ...paymentData(pet, payment?.option || appt.paymentOption) });
  const favs = await favoritersOf(pet.id, [appt.adopterId, pet.ownerId], transaction);
  await notify([
    { userId: pet.ownerId, type: 'appointment.created', data },
    ...favs.map((userId) => ({ userId, type: 'favorite.in_process', data: { petId: pet.id, petName: pet.name } })),
  ], transaction);
};

// actor: 'owner' | 'adopter'
exports.appointmentStatusChanged = async ({ appt, pet, status, actor }, transaction) => {
  const data = await apptData(appt, pet, transaction);
  if (status === 'confirmed') {
    await notify([{ userId: appt.adopterId, type: 'appointment.confirmed', data }], transaction);
  } else if (status === 'cancelled') {
    const other = actor === 'owner' ? appt.adopterId : pet.ownerId;
    await notify([{ userId: other, type: 'appointment.cancelled', data: { ...data, cancellationReason: appt.cancellationReason } }], transaction);
  } else if (status === 'completed') {
    // Al comprador se le avisa "¡Entrega completada!" cuando el contrato ya existe (ver contract.service)
    const favs = await favoritersOf(pet.id, [appt.adopterId, pet.ownerId], transaction);
    await notify(favs.map((userId) => ({ userId, type: 'favorite.adopted', data: { petId: pet.id, petName: pet.name } })), transaction);
  }
};

// Otro horario: propuesto → comprador; aceptado o rechazado → vendedor
exports.appointmentProposal = async ({ appt, pet, kind }, transaction) => {
  const data = await apptData(appt, pet, transaction, { proposedMeetingDate: appt.proposedMeetingDate });
  const map = {
    proposed: { userId: appt.adopterId, type: 'appointment.rescheduled' },
    accepted: { userId: pet.ownerId, type: 'appointment.proposal_accepted' },
    rejected: { userId: pet.ownerId, type: 'appointment.proposal_rejected' },
  };
  await notify([{ ...map[kind], data }], transaction);
};

// Contrato listo (o falló definitivamente): "¡Entrega completada!" al comprador; si falló, aviso al vendedor y al equipo
exports.contractReady = async ({ appt, pet }) => {
  const data = await apptData(appt, pet, undefined);
  await notify([{ userId: appt.adopterId, type: 'appointment.completed', data }]);
};

exports.contractFailed = async ({ appt, pet }) => {
  const data = await apptData(appt, pet, undefined);
  const admins = await User.findAll({ where: { role: 'admin', suspendedAt: null }, attributes: ['id'] });
  await notify([
    { userId: appt.adopterId, type: 'appointment.completed', data: { ...data, contractDelayed: true } },
    { userId: pet.ownerId, type: 'contract.failed', data },
    ...admins.map((a) => ({ userId: a.id, type: 'contract.failed', data })),
  ]);
};

// Cita cancelada por suspensión de una de las partes: se avisa solo a la otra
exports.appointmentCancelledBySuspension = async ({ appt, pet, suspendedUserId }, transaction) => {
  const data = await apptData(appt, pet, transaction, { cancellationReason: 'account_suspended' });
  const other = suspendedUserId === appt.adopterId ? pet.ownerId : appt.adopterId;
  await notify([{ userId: other, type: 'appointment.cancelled', data }], transaction);
};

exports.organizationVerificationChanged = (userId, verified) =>
  notify([{ userId, type: verified ? 'organization.verified' : 'organization.revoked', data: {} }]);
