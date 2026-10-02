const { Op } = require('sequelize');
const { sequelize, User, Appointment, Pet, VetClinic, RefreshToken } = require('../../models');
const AppError = require('../../utils/AppError');
const mailer = require('../../utils/mailer');
const logger = require('../../config/logger');
const { escapeHtml } = require('../../utils/escape');
const { escapeLike } = require('../../utils/escape');
const { toAdminUserDTO } = require('./admin.dto');
const events = require('../notifications/notification.events');

exports.listOrganizations = async (status) => {
  const where = { role: ['shelter', 'breeder'] };
  if (status === 'pending') where.isVerified = false;
  if (status === 'verified') where.isVerified = true;
  return User.findAll({ where, order: [['createdAt', 'ASC']] });
};

exports.verify = async (adminId, orgId) => {
  const org = await User.findOne({ where: { id: orgId, role: ['shelter', 'breeder'] } });
  if (!org) throw AppError.notFound('Organización no encontrada');
  await org.update({ isVerified: true, verifiedAt: new Date(), verifiedBy: adminId });
  await events.organizationVerificationChanged(org.id, true); // notificación + correo
  return org;
};

exports.revoke = async (orgId) => {
  const org = await User.findOne({ where: { id: orgId, role: ['shelter', 'breeder'] } });
  if (!org) throw AppError.notFound('Organización no encontrada');
  await org.update({ isVerified: false, verifiedAt: null, verifiedBy: null });
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
    where, order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit,
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

const ACTIVE = ['pending', 'confirmed'];

// Suspender: no puede iniciar sesión, se cierran sus sesiones, sus publicaciones dejan de mostrarse
// y se cancelan sus citas activas (como dueño o como adoptante) para no dejar a nadie esperando.
exports.suspend = async (adminId, userId, { reason } = {}) => {
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
      await appt.update({ status: 'cancelled', cancelledBy: adminId, cancellationReason: 'account_suspended' }, { transaction: t });
      await Pet.update({ status: 'available' }, { where: { id: appt.petId, status: 'in_process' }, transaction: t });
      await events.appointmentCancelledBySuspension({ appt, pet: appt.pet, suspendedUserId: userId }, t);
    }
  });

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
exports.reactivate = async (userId) => {
  const user = await User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuario no encontrado');
  if (!user.suspendedAt) return toAdminUserDTO(user);

  await user.update({ suspendedAt: null, suspendedBy: null, suspensionReason: null });
  mailer.send({
    to: user.email,
    subject: 'Tu cuenta fue reactivada',
    html: `<p>Hola ${escapeHtml(user.fullName)}, tu cuenta ya está activa de nuevo. Puedes iniciar sesión normalmente.</p>`,
  }).catch((err) => logger.warn({ err }, 'No se pudo enviar el aviso de reactivación'));
  return toAdminUserDTO(user);
};
