const nodemailer = require('nodemailer');
const env = require('../config/env');

const transporter = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST, port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465, // 465 = TLS directo; 587 = STARTTLS
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

exports.isConfigured = () => Boolean(transporter);

// Comprueba conexión y credenciales contra el servidor SMTP (lo usa scripts/test-smtp.js)
exports.verify = () => (transporter ? transporter.verify() : Promise.reject(new Error('SMTP_HOST no está configurado')));

// Si no hay SMTP configurado, simplemente no envía nada.
// No rompe el flujo: nunca lances este error hacia el usuario.
exports.send = async ({ to, subject, html, replyTo }) => {
  if (!transporter) return;
  await transporter.sendMail({ from: `"${env.APP_NAME}" <${env.MAIL_FROM}>`, to, subject, html, replyTo });
};
