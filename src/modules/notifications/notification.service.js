const { Op } = require('sequelize');
const { Notification } = require('../../models');
const AppError = require('../../utils/AppError');
const { render } = require('./notification.messages');

const toDTO = (n) => ({
  id: n.id, type: n.type, data: n.data, ...render(n.type, n.data),
  isRead: Boolean(n.readAt), readAt: n.readAt, createdAt: n.createdAt,
});

exports.list = async (user, { unread, page, limit }) => {
  const where = { userId: user.id };
  if (unread === true) where.readAt = null;
  if (unread === false) where.readAt = { [Op.ne]: null };
  const [{ rows, count }, unreadCount] = await Promise.all([
    Notification.findAndCountAll({ where, order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit }),
    Notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return { items: rows.map(toDTO), unreadCount, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};

exports.markRead = async (user, id) => {
  const n = await Notification.findOne({ where: { id, userId: user.id } });
  if (!n) throw AppError.notFound('Notificación no encontrada');
  if (!n.readAt) await n.update({ readAt: new Date() });
  return toDTO(n);
};

exports.markAllRead = async (user) => {
  const [updated] = await Notification.update({ readAt: new Date() }, { where: { userId: user.id, readAt: null } });
  return { updated };
};
