const { UniqueConstraintError } = require('sequelize');
const { NewsletterSubscriber } = require('../../models');

// Idempotente: suscribir un correo que ya existe no es un error, y si se había dado de baja se reactiva
exports.subscribe = async ({ email }) => {
  try {
    const [sub, created] = await NewsletterSubscriber.findOrCreate({ where: { email }, defaults: { subscribedAt: new Date() } });
    if (!created && sub.unsubscribedAt) await sub.update({ unsubscribedAt: null, subscribedAt: new Date() });
  } catch (err) {
    if (err instanceof UniqueConstraintError) return; // dos envíos simultáneos del mismo correo
    throw err;
  }
};

// No revela si el correo estaba suscrito
exports.unsubscribe = async ({ email }) => {
  await NewsletterSubscriber.update({ unsubscribedAt: new Date() }, { where: { email, unsubscribedAt: null } });
};
