const { Op } = require('sequelize');
const {
  sequelize, User, Appointment, Pet, VetClinic, RefreshToken, StaffRole, Payment, Payout, SupportMessage, AuditLog,
} = require('../../models');
const AppError = require('../../utils/AppError');
const mailer = require('../../utils/mailer');
const logger = require('../../config/logger');
const { escapeHtml } = require('../../utils/escape');
const { escapeLike } = require('../../utils/escape');
const { toAdminUserDTO } = require('./admin.dto');
const events = require('../notifications/notification.events');
const payments = require('../payments/payment.service');
const { audit } = require('../../utils/audit');

exports.listOrganizations = async (status) => {
  const where = { role: ['shelter', 'breeder'] };
  if (status === 'pending') where.isVerified = false;
  if (status === 'verified') where.isVerified = true;
  return User.findAll({ where, order: [['createdAt', 'ASC']] });
};

exports.verify = async (actor, orgId) => {
  const org = await User.findOne({ where: { id: orgId, role: ['shelter', 'breeder'] } });
  if (!org) throw AppError.notFound('Organización no encontrada');
  await org.update({ isVerified: true, verifiedAt: new Date(), verifiedBy: actor.id });
  await audit(actor, 'organization.verify', { type: 'user', id: org.id });
  await events.organizationVerificationChanged(org.id, true); // notificación + correo
  return org;
};

exports.revoke = async (actor, orgId) => {
  const org = await User.findOne({ where: { id: orgId, role: ['shelter', 'breeder'] } });
  if (!org) throw AppError.notFound('Organización no encontrada');
  await org.update({ isVerified: false, verifiedAt: null, verifiedBy: null });
  await audit(actor, 'organization.revoke', { type: 'user', id: org.id });
  await events.organizationVerificationChanged(org.id, false);
  return org;
};

exports.listUsers = async ({ role, search, status, page, limit }) => {
  const where = {};
  if (role) where.role = role;
  if (status === 'active') where.suspendedAt = null;
  if (status === 'suspended') where.suspendedAt = { [Op.ne]: null };
  if (search) {
    const term = `%${escapeLike(search)}%`;
    where[Op.or] = [{ fullName: { [Op.iLike]: term } }, { email: { [Op.iLike]: term } }];
  }
  const { rows, count } = await User.findAndCountAll({
    where, include: [{ model: StaffRole, as: 'staffRole', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit,
  });
  return { items: rows.map(toAdminUserDTO), meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};

// A diferencia de GET /appointments, aquí se ven TODAS las citas del sistema
exports.listAppointments = async ({ status, page, limit }) => {
  const { rows, count } = await Appointment.findAndCountAll({
    where: status ? { status } : {},
    distinct: true, limit, offset: (page - 1) * limit, order: [['meetingDate', 'DESC']],
    include: [
      {
        model: Pet, as: 'pet', attributes: ['id', 'name', 'imageUrl', 'ownerId'], paranoid: false,
        include: [{ model: User, as: 'owner', attributes: ['id', 'fullName', 'email', 'phone', 'role'], paranoid: false }],
      },
      { model: VetClinic, as: 'clinic', attributes: ['id', 'name', 'address', 'city', 'phone'] },
      { model: User, as: 'adopter', attributes: ['id', 'fullName', 'email', 'phone'], paranoid: false },
    ],
  });
  return { items: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};

const ACTIVE = ['pending_payment', 'pending', 'confirmed'];

// Suspender: no puede iniciar sesión, se cierran sus sesiones, sus publicaciones dejan de mostrarse
// y se cancelan sus citas activas (como dueño o como adoptante) para no dejar a nadie esperando.
exports.suspend = async (actor, userId, { reason } = {}) => {
  const adminId = actor.id;
  if (userId === adminId) throw AppError.forbidden('No puedes suspender tu propia cuenta');
  const user = await User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuario no encontrado');
  if (user.role === 'admin') throw AppError.forbidden('No se puede suspender a un administrador');
  if (user.suspendedAt) return toAdminUserDTO(user);

  await sequelize.transaction(async (t) => {
    await user.update({ suspendedAt: new Date(), suspendedBy: adminId, suspensionReason: reason ?? null }, { transaction: t });
    await RefreshToken.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null }, transaction: t });

    const appts = await Appointment.findAll({
      where: { status: ACTIVE, [Op.or]: [{ adopterId: userId }, { '$pet.ownerId$': userId }] },
      include: [{ model: Pet, as: 'pet', attributes: ['id', 'ownerId', 'name'] }],
      transaction: t,
    });
    for (const appt of appts) {
      const wasPendingPayment = appt.status === 'pending_payment';
      await appt.update({ status: 'cancelled', cancelledBy: adminId, cancellationReason: 'account_suspended' }, { transaction: t });
      await Pet.update({ status: 'available' }, { where: { id: appt.petId, status: 'in_process' }, transaction: t });
      await payments.flagRefundIfPaid(appt.id, 'Cita cancelada por suspensión de una cuenta', t);
      if (!wasPendingPayment) await events.appointmentCancelledBySuspension({ appt, pet: appt.pet, suspendedUserId: userId }, t);
    }
  });
  await audit(actor, 'user.suspend', { type: 'user', id: userId }, { reason });

  mailer.send({
    to: user.email,
    subject: 'Tu cuenta fue suspendida',
    html: `<p>Hola ${escapeHtml(user.fullName)}, tu cuenta fue suspendida por un administrador.</p>
      ${reason ? `<p><strong>Motivo:</strong> ${escapeHtml(reason)}</p>` : ''}
      <p>Si crees que es un error, responde a este correo o escríbenos desde el formulario de contacto.</p>`,
  }).catch((err) => logger.warn({ err }, 'No se pudo enviar el aviso de suspensión'));

  return toAdminUserDTO(user);
};

// Reactivar: vuelve a poder entrar y sus publicaciones reaparecen. Las citas canceladas no se restauran.
exports.reactivate = async (actor, userId) => {
  const user = await User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuario no encontrado');
  if (!user.suspendedAt) return toAdminUserDTO(user);

  await user.update({ suspendedAt: null, suspendedBy: null, suspensionReason: null });
  await audit(actor, 'user.reactivate', { type: 'user', id: userId });
  mailer.send({
    to: user.email,
    subject: 'Tu cuenta fue reactivada',
    html: `<p>Hola ${escapeHtml(user.fullName)}, tu cuenta ya está activa de nuevo. Puedes iniciar sesión normalmente.</p>`,
  }).catch((err) => logger.warn({ err }, 'No se pudo enviar el aviso de reactivación'));
  return toAdminUserDTO(user);
};

// ---------- Resumen (permiso `resumen`) ----------

const countBy = async (Model, column, where = {}) => {
  const rows = await Model.findAll({ where, attributes: [column, [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: [column], raw: true });
  return Object.fromEntries(rows.map((r) => [r[column], Number(r.n)]));
};

exports.summary = async () => {
  const [usersByRole, petsByStatus, appointmentsByStatus, pendingOrgs, pendingClinics, openSupport, refundsRequired, pendingPayouts] = await Promise.all([
    countBy(User, 'role'),
    countBy(Pet, 'status'),
    countBy(Appointment, 'status'),
    User.count({ where: { role: ['shelter', 'breeder'], isVerified: { [Op.not]: true }, suspendedAt: null } }),
    VetClinic.count({ where: { status: 'pending' } }),
    SupportMessage.count({ where: { status: 'open' } }),
    Payment.count({ where: { refundStatus: 'required' } }),
    Payout.count({ where: { status: 'pending' } }),
  ]);
  return { usersByRole, petsByStatus, appointmentsByStatus, pendingOrgs, pendingClinics, openSupport, refundsRequired, pendingPayouts };
};

// ---------- Pagos y desembolsos (solo admin principal) ----------

exports.listPayments = async ({ status, refundStatus, page, limit }) => {
  const where = {};
  if (status) where.status = status;
  if (refundStatus) where.refundStatus = refundStatus;
  const { rows, count } = await Payment.findAndCountAll({
    where,
    include: [
      { model: User, as: 'buyer', attributes: ['id', 'fullName', 'email', 'phone'] },
      { model: Appointment, as: 'appointment', attributes: ['id', 'status', 'meetingDate', 'petId'] },
    ],
    order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit,
  });
  return {
    items: rows.map((p) => ({
      ...payments.toPaymentDTO(p), reference: p.reference, providerTransactionId: p.providerTransactionId, refundNote: p.refundNote,
      createdAt: p.createdAt, buyer: p.buyer, appointment: p.appointment,
    })),
    meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  };
};

// La devolución se hace a mano en el panel de Wompi; aquí se deja registrada
exports.updateRefund = async (actor, id, { refundStatus, refundNote }) => {
  const payment = await Payment.findByPk(id);
  if (!payment) throw AppError.notFound('Pago no encontrado');
  const changes = { refundStatus, refundNote: refundNote ?? payment.refundNote };
  if (refundStatus === 'refunded') changes.status = 'refunded';
  await payment.update(changes);
  await audit(actor, 'payment.refund', { type: 'payment', id }, { refundStatus, refundNote });
  return payments.toPaymentDTO(payment);
};

exports.listPayouts = async ({ status, page, limit }) => {
  const { rows, count } = await Payout.findAndCountAll({
    where: status ? { status } : {},
    include: [
      { model: User.scope('withPayoutInfo'), as: 'seller', attributes: ['id', 'fullName', 'email', 'phone', 'payoutInfo'] },
      { model: Appointment, as: 'appointment', attributes: ['id', 'meetingDate', 'petId'] },
    ],
    order: [['createdAt', 'ASC']], limit, offset: (page - 1) * limit,
  });
  return {
    items: rows.map((p) => ({
      id: p.id, amount: Number(p.amount), status: p.status, paidAt: p.paidAt, transferReference: p.transferReference,
      createdAt: p.createdAt, seller: p.seller, appointment: p.appointment,
    })),
    meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  };
};

exports.markPayoutPaid = async (actor, id, { transferReference }) => {
  const payout = await Payout.findByPk(id);
  if (!payout) throw AppError.notFound('Desembolso no encontrado');
  if (payout.status === 'paid') throw AppError.conflict('Este desembolso ya está marcado como pagado');
  await payout.update({ status: 'paid', paidAt: new Date(), paidBy: actor.id, transferReference });
  await audit(actor, 'payout.paid', { type: 'payout', id }, { transferReference });
  return { id: payout.id, status: payout.status, paidAt: payout.paidAt, transferReference };
};

// ---------- Auditoría (solo admin principal) ----------

exports.listAudit = async ({ actorId, action, page, limit }) => {
  const where = {};
  if (actorId) where.actorId = actorId;
  if (action) where.action = { [Op.like]: `${escapeLike(action)}%` };
  const { rows, count } = await AuditLog.findAndCountAll({
    where, include: [{ model: User, as: 'actor', attributes: ['id', 'fullName', 'role'] }],
    order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit,
  });
  return { items: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};
