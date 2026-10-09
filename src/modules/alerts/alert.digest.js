const { Op } = require('sequelize');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { sequelize, SearchAlert, Pet, User } = require('../../models');
const mailer = require('../../utils/mailer');
const { escapeHtml, escapeLike } = require('../../utils/escape');
const { publicPriceOf } = require('../../config/business');
const { PUBLIC_PRICE_SQL } = require('../pets/pet.service');

const LOCK_KEY = 74201; // pg advisory lock: si hay varias réplicas, solo una procesa a la vez
const MAX_PETS_PER_EMAIL = 10;
// El comprador ve (y filtra por) el precio publicado, con la comisión incluida
const formatPrice = (pet) => (pet.adoptionType === 'sale' ? `$${publicPriceOf(pet.price).toLocaleString('es-CO')}` : 'En adopción');

const matchWhere = (alert, until) => {
  const where = {
    status: 'available',
    ownerId: { [Op.ne]: alert.userId },
    createdAt: { [Op.gt]: alert.lastCheckedAt, [Op.lte]: until },
  };
  if (alert.breed) where.breed = { [Op.iLike]: `%${escapeLike(alert.breed)}%` };
  if (alert.city) where.city = { [Op.iLike]: `%${escapeLike(alert.city)}%` };
  if (alert.adoptionType) where.adoptionType = alert.adoptionType;
  // minPrice/maxPrice los arma el frontend con el precio publicado (con comisión): se compara contra ese
  const priceRange = [];
  if (alert.minPrice !== null) priceRange.push(sequelize.where(sequelize.literal(PUBLIC_PRICE_SQL), { [Op.gte]: alert.minPrice }));
  if (alert.maxPrice !== null) priceRange.push(sequelize.where(sequelize.literal(PUBLIC_PRICE_SQL), { [Op.lte]: alert.maxPrice }));
  if (priceRange.length) where[Op.and] = priceRange;
  return where;
};

const searchLink = (alert) => {
  const qs = new URLSearchParams();
  if (alert.breed) qs.set('breed', alert.breed);
  if (alert.city) qs.set('city', alert.city);
  const query = qs.toString();
  return `${env.FRONTEND_URL.replace(/\/$/, '')}/buscar${query ? `?${query}` : ''}`;
};

const renderEmail = (user, alert, pets, total) => {
  const items = pets.map((p) =>
    `<li><strong>${escapeHtml(p.name)}</strong> — ${escapeHtml(p.breed)}, ${escapeHtml(p.city)} — ${formatPrice(p)}</li>`).join('');
  const more = total > pets.length ? `<p>…y ${total - pets.length} más.</p>` : '';
  const resumen = total === 1 ? 'una mascota nueva que coincide' : `${total} mascotas nuevas que coinciden`;
  return `<p>Hola ${escapeHtml(user.fullName)}, hay ${resumen} con tu alerta:</p>
    <ul>${items}</ul>${more}
    <p><a href="${escapeHtml(searchLink(alert))}">Ver en ${escapeHtml(env.APP_NAME)}</a></p>
    <p style="color:#666;font-size:12px">Recibes este correo porque creaste una alerta de búsqueda. Puedes cancelarla desde tu cuenta.</p>`;
};

// Revisa todas las alertas y envía UN correo por alerta con las mascotas nuevas que coinciden.
// - Cada alerta recibe como máximo un correo cada SEARCH_ALERTS_COOLDOWN_HOURS.
// - Mientras está en espera no se mueve su cursor, así las mascotas nuevas se acumulan para el próximo correo.
// - Sin SMTP no hace nada (si no, avanzaría los cursores y el usuario perdería esos avisos).
exports.runSearchAlertsDigest = async (now = new Date()) => {
  if (!mailer.isConfigured()) return { skipped: 'smtp-no-configurado' };

  return sequelize.transaction(async (t) => {
    const [[{ locked }]] = await sequelize.query('SELECT pg_try_advisory_xact_lock(:key) AS locked',
      { replacements: { key: LOCK_KEY }, transaction: t });
    if (!locked) return { skipped: 'otra-instancia-procesando' };

    const cooldownLimit = new Date(now.getTime() - env.SEARCH_ALERTS_COOLDOWN_HOURS * 3600000);
    const alerts = await SearchAlert.findAll({
      where: { [Op.or]: [{ lastNotifiedAt: null }, { lastNotifiedAt: { [Op.lte]: cooldownLimit } }] },
      include: [{ model: User, as: 'user', attributes: ['id', 'email', 'fullName'], where: { suspendedAt: null }, required: true }],
      transaction: t,
    });

    let sent = 0;
    for (const alert of alerts) {
      const { rows: pets, count: total } = await Pet.findAndCountAll({
        where: matchWhere(alert, now),
        include: [{ model: User, as: 'owner', attributes: [], where: { suspendedAt: null }, required: true }],
        order: [['createdAt', 'DESC']], limit: MAX_PETS_PER_EMAIL, distinct: true, transaction: t,
      });

      if (!total) {
        await alert.update({ lastCheckedAt: now }, { transaction: t });
        continue;
      }
      try {
        await mailer.send({
          to: alert.user.email,
          subject: `Nuevas mascotas para tu alerta en ${env.APP_NAME}`,
          html: renderEmail(alert.user, alert, pets, total),
        });
        await alert.update({ lastCheckedAt: now, lastNotifiedAt: now }, { transaction: t });
        sent += 1;
      } catch (err) {
        // No se avanza el cursor: se reintenta en la próxima corrida
        logger.warn({ err, alertId: alert.id }, 'No se pudo enviar la alerta de búsqueda');
      }
    }
    return { revisadas: alerts.length, enviadas: sent };
  });
};
