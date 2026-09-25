const nodemailer = require('nodemailer');
const env = require('../config/env');

const transporter = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST, port: env.SMTP_PORT, secure: false,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

// Si no hay SMTP configurado (caso hoy, sin costo), simplemente no envía nada.
// No rompe el flujo: nunca lances este error hacia el usuario.
exports.send = async ({ to, subject, html }) => {
  if (!transporter) return;
  await transporter.sendMail({ from: env.MAIL_FROM, to, subject, html });
};