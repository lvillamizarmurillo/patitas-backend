const { UniqueConstraintError } = require('sequelize');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { NewsletterSubscriber } = require('../../models');
const mailer = require('../../utils/mailer');
const { escapeHtml } = require('../../utils/escape');

const sendWelcome = (email) => mailer.send({
  to: email,
  subject: `Te suscribiste al boletín de ${env.APP_NAME}`,
  html: `<p>¡Gracias por suscribirte! Te contaremos sobre nuevas mascotas, consejos y novedades.</p>
    <p>Si no fuiste tú, ignora este correo o date de baja desde ${escapeHtml(env.FRONTEND_URL)}.</p>
    <p>— Equipo ${escapeHtml(env.APP_NAME)}</p>`,
}).catch((err) => logger.warn({ err }, 'No se pudo enviar la confirmación del newsletter'));

// Idempotente: suscribir un correo que ya existe no es un error, y si se había dado de baja se reactiva.
// El correo de confirmación sale solo en altas nuevas o reactivaciones (no en cada reenvío del formulario).
exports.subscribe = async ({ email }) => {
  try {
    const [sub, created] = await NewsletterSubscriber.findOrCreate({ where: { email }, defaults: { subscribedAt: new Date() } });
    if (created) { sendWelcome(email); return; } // sin await: el SMTP no debe frenar la respuesta
    if (sub.unsubscribedAt) {
      await sub.update({ unsubscribedAt: null, subscribedAt: new Date() });
      sendWelcome(email);
    }
  } catch (err) {
    if (err instanceof UniqueConstraintError) return; // dos envíos simultáneos del mismo correo
    throw err;
  }
};

// No revela si el correo estaba suscrito
exports.unsubscribe = async ({ email }) => {
  await NewsletterSubscriber.update({ unsubscribedAt: new Date() }, { where: { email, unsubscribedAt: null } });
};
