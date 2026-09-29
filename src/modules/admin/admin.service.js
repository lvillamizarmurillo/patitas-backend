const { Op } = require('sequelize');
const { User, Appointment, Pet, VetClinic } = require('../../models');
const AppError = require('../../utils/AppError');
const mailer = require('../../utils/mailer');
const { escapeLike } = require('../../utils/escape');
const { toAdminUserDTO } = require('./admin.dto');

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
  mailer.send({
    to: org.email, subject: 'Tu organización fue verificada en Patitas',
    html: `<p>Hola ${org.fullName}, tu cuenta ya está verificada y puede publicar mascotas.</p>`,
  }).catch(() => {});
  return org;
};

exports.revoke = async (orgId) => {
  const org = await User.findOne({ where: { id: orgId, role: ['shelter', 'breeder'] } });
  if (!org) throw AppError.notFound('Organización no encontrada');
  await org.update({ isVerified: false, verifiedAt: null, verifiedBy: null });
  return org;
};

exports.listUsers = async ({ role, search, page, limit }) => {
  const where = {};
  if (role) where.role = role;
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
