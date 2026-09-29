const env = require('../../config/env');
const logger = require('../../config/logger');
const { User, SupportMessage } = require('../../models');
const AppError = require('../../utils/AppError');
const mailer = require('../../utils/mailer');
const { escapeHtml } = require('../../utils/escape');

exports.contact = async (authUser, data) => {
  const user = authUser ? await User.findByPk(authUser.id) : null;
  const name = data.name || user?.fullName;
  const email = data.email || user?.email;
  if (!name || !email) {
    const missing = [!name && 'name', !email && 'email'].filter(Boolean);
    throw AppError.badRequest('Datos inválidos', missing.map((f) => ({ field: `body.${f}`, message: 'Requerido' })));
  }

  const msg = await SupportMessage.create({ userId: user?.id ?? null, name, email, message: data.message });

  if (env.SUPPORT_EMAIL) {
    mailer.send({
      to: env.SUPPORT_EMAIL,
      subject: `[Soporte Patitas] Mensaje de ${name}`,
      html: `<p><strong>De:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
        <p><strong>Usuario:</strong> ${user ? `${escapeHtml(user.id)} (${escapeHtml(user.role)})` : 'visitante sin sesión'}</p>
        <p><strong>Mensaje:</strong></p>
        <p style="white-space:pre-wrap">${escapeHtml(data.message)}</p>`,
    }).catch((err) => logger.warn({ err }, 'No se pudo reenviar el mensaje de soporte'));
  }
  return { id: msg.id, createdAt: msg.createdAt };
};
