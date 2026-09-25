const { User } = require('../../models');
const AppError = require('../../utils/AppError');
const mailer = require('../../utils/mailer');

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