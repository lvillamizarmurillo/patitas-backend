const { SearchAlert } = require('../../models');
const AppError = require('../../utils/AppError');
const { toAlertDTO } = require('./alert.dto');

const MAX_ALERTS_PER_USER = 10;

exports.create = async (user, data) => {
  const count = await SearchAlert.count({ where: { userId: user.id } });
  if (count >= MAX_ALERTS_PER_USER) throw AppError.conflict(`Puedes tener máximo ${MAX_ALERTS_PER_USER} alertas activas`);
  // lastCheckedAt = ahora: solo avisa de mascotas publicadas DESPUÉS de crear la alerta
  const alert = await SearchAlert.create({ ...data, userId: user.id, lastCheckedAt: new Date() });
  return toAlertDTO(alert);
};

exports.list = async (user) => {
  const alerts = await SearchAlert.findAll({ where: { userId: user.id }, order: [['createdAt', 'DESC']] });
  return alerts.map(toAlertDTO);
};

exports.remove = async (user, id) => {
  const deleted = await SearchAlert.destroy({ where: { id, userId: user.id } });
  if (!deleted) throw AppError.notFound('Alerta no encontrada');
};
