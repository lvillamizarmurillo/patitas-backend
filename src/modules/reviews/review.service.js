const { Op, fn, col, UniqueConstraintError } = require('sequelize');
const { REVIEW_DELAY_DAYS } = require('../../config/business');
const { sequelize, Review, Appointment, Pet, User } = require('../../models');
const AppError = require('../../utils/AppError');
const { audit } = require('../../utils/audit');
const events = require('../notifications/notification.events');

const eligibleSince = () => new Date(Date.now() - REVIEW_DELAY_DAYS * 86400000);

const toReviewDTO = (r) => ({
  id: r.id, rating: r.rating, dealClosed: r.dealClosed, comment: r.comment ?? null, createdAt: r.createdAt,
  buyer: r.buyer ? { fullName: r.buyer.fullName } : null,
  pet: r.pet ? { name: r.pet.name } : null,
});

// Recalcula el promedio público del vendedor (sin contar las ocultas)
const recompute = async (sellerId, transaction) => {
  const [row] = await Review.findAll({
    where: { sellerId, hiddenAt: null },
    attributes: [[fn('AVG', col('rating')), 'avg'], [fn('COUNT', col('id')), 'count']],
    raw: true, transaction,
  });
  const count = Number(row.count);
  await User.update(
    { ratingAverage: count ? Number(row.avg).toFixed(2) : null, ratingCount: count },
    { where: { id: sellerId }, transaction },
  );
};

// Encuestas pendientes del comprador: citas suyas de hace 3 días o más, confirmadas o completadas, sin calificar
exports.pending = async (buyer) => {
  const appts = await Appointment.findAll({
    where: { adopterId: buyer.id, status: ['confirmed', 'completed'], meetingDate: { [Op.lte]: eligibleSince() } },
    include: [
      { model: Pet, as: 'pet', attributes: ['id', 'name', 'imageUrl'], paranoid: false, include: [{ model: User, as: 'owner', attributes: ['fullName'] }] },
      { model: Review, as: 'review', attributes: ['id'], required: false },
    ],
    order: [['meetingDate', 'ASC']],
  });
  return appts.filter((a) => !a.review && a.pet).map((a) => ({
    appointmentId: a.id, meetingDate: a.meetingDate,
    pet: { name: a.pet.name, imageUrl: a.pet.imageUrl },
    seller: { fullName: a.pet.owner?.fullName ?? null },
  }));
};

exports.create = async (buyer, { appointmentId, dealClosed, rating, comment }) => {
  try {
    return await sequelize.transaction(async (t) => {
      const appt = await Appointment.findByPk(appointmentId, {
        include: [{ model: Pet, as: 'pet', paranoid: false }], transaction: t, lock: { level: t.LOCK.UPDATE, of: Appointment },
      });
      if (!appt || appt.adopterId !== buyer.id) throw AppError.notFound('Cita no encontrada');
      if (!['confirmed', 'completed'].includes(appt.status) || new Date(appt.meetingDate) > eligibleSince()) {
        throw AppError.conflict(`Puedes calificar ${REVIEW_DELAY_DAYS} días después de la cita`);
      }
      if (await Review.findOne({ where: { appointmentId }, transaction: t })) throw AppError.conflict('Ya calificaste esta cita');

      const review = await Review.create({
        appointmentId, buyerId: buyer.id, sellerId: appt.pet.ownerId, petId: appt.petId, dealClosed, rating, comment,
      }, { transaction: t });
      await recompute(appt.pet.ownerId, t);
      // Si el comprador dice que sí hubo compra pero la cita sigue confirmada, se le recuerda al vendedor cerrarla
      if (dealClosed && appt.status === 'confirmed') {
        await events.notify([{
          userId: appt.pet.ownerId, type: 'review.deal_closed',
          data: { appointmentId, petId: appt.petId, petName: appt.pet.name },
        }], t);
      }
      return { id: review.id, rating, dealClosed, createdAt: review.createdAt };
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError) throw AppError.conflict('Ya calificaste esta cita');
    throw err;
  }
};

// Vendedor: resumen y calificaciones recibidas (con comentarios: solo él y el admin los ven)
exports.mine = async (seller) => {
  const reviews = await Review.findAll({
    where: { sellerId: seller.id, hiddenAt: null },
    include: [
      { model: User, as: 'buyer', attributes: ['fullName'] },
      { model: Pet, as: 'pet', attributes: ['name'], paranoid: false },
    ],
    order: [['createdAt', 'DESC']],
  });
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  reviews.forEach((r) => { distribution[r.rating] += 1; });
  const count = reviews.length;
  const average = count ? Number((reviews.reduce((s, r) => s + r.rating, 0) / count).toFixed(1)) : null;
  return { summary: { average, count, distribution }, items: reviews.map(toReviewDTO) };
};

// Admin: todas, paginadas, con filtros por vendedor y estrellas
exports.adminList = async ({ sellerId, rating, page, limit }) => {
  const where = {};
  if (sellerId) where.sellerId = sellerId;
  if (rating) where.rating = rating;
  const { rows, count } = await Review.findAndCountAll({
    where,
    include: [
      { model: User, as: 'buyer', attributes: ['fullName'] },
      { model: User, as: 'seller', attributes: ['id', 'fullName'] },
      { model: Pet, as: 'pet', attributes: ['name'], paranoid: false },
    ],
    order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit,
  });
  return {
    items: rows.map((r) => ({ ...toReviewDTO(r), seller: { id: r.seller?.id, fullName: r.seller?.fullName }, hidden: Boolean(r.hiddenAt) })),
    meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  };
};

// Ocultar (o mostrar de nuevo) una calificación abusiva: deja de contar en el promedio
exports.setHidden = async (actor, id, hidden) => {
  const review = await Review.findByPk(id);
  if (!review) throw AppError.notFound('Calificación no encontrada');
  await sequelize.transaction(async (t) => {
    await review.update({ hiddenAt: hidden ? new Date() : null, hiddenBy: hidden ? actor.id : null }, { transaction: t });
    await recompute(review.sellerId, t);
  });
  await audit(actor, hidden ? 'review.hide' : 'review.unhide', { type: 'review', id });
  return { id, hidden };
};
