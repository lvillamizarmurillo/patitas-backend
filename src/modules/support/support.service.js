const { Op, fn, col } = require('sequelize');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { User, SupportMessage, SupportReply } = require('../../models');
const AppError = require('../../utils/AppError');
const mailer = require('../../utils/mailer');
const { escapeHtml, escapeLike } = require('../../utils/escape');
const { audit } = require('../../utils/audit');
const { AUDIENCES } = require('./support.schemas');

exports.contact = async (authUser, data) => {
  const user = authUser ? await User.findByPk(authUser.id) : null;
  const name = data.name || user?.fullName;
  const email = data.email || user?.email;
  if (!name || !email) {
    const missing = [!name && 'name', !email && 'email'].filter(Boolean);
    throw AppError.badRequest('Datos inválidos', missing.map((f) => ({ field: `body.${f}`, message: 'Requerido' })));
  }

  const msg = await SupportMessage.create({
    userId: user?.id ?? null, name, email, message: data.message,
    phone: data.phone || user?.phone || null, audience: data.audience ?? null, topic: data.topic ?? null,
  });

  if (env.SUPPORT_EMAIL) {
    mailer.send({
      to: env.SUPPORT_EMAIL,
      subject: `[Soporte ${env.APP_NAME}] ${data.topic ? `(${data.topic}) ` : ''}Mensaje de ${name.slice(0, 60)}`,
      replyTo: email, // responder desde el buzón de soporte le llega directo al usuario
      html: `<p><strong>De:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;${data.audience ? ` · ${escapeHtml(data.audience)}` : ''}</p>
        <p><strong>Usuario:</strong> ${user ? `${escapeHtml(user.id)} (${escapeHtml(user.role)})` : 'visitante sin sesión'}</p>
        <p><strong>Mensaje:</strong></p>
        <p style="white-space:pre-wrap">${escapeHtml(data.message)}</p>`,
    }).catch((err) => logger.warn({ err }, 'No se pudo reenviar el mensaje de soporte'));
  }

  // Acuse de recibo al remitente. A propósito NO repite el mensaje ni el nombre: como el formulario es
  // público, repetirlos permitiría usarnos para mandar texto arbitrario a cualquier correo.
  mailer.send({
    to: email,
    subject: `Recibimos tu mensaje — ${env.APP_NAME}`,
    html: `<p>¡Hola! Recibimos tu mensaje y nuestro equipo te responderá pronto a este correo.</p>
      <p>Si no fuiste tú quien escribió, puedes ignorar este correo.</p>
      <p>— Equipo ${escapeHtml(env.APP_NAME)}</p>`,
  }).catch((err) => logger.warn({ err }, 'No se pudo enviar el acuse de soporte'));

  return { id: msg.id, createdAt: msg.createdAt };
};

// ---------- Bandeja del admin (permiso `soporte`) ----------

const toAdminDTO = (m) => ({
  id: m.id, name: m.name, email: m.email, phone: m.phone ?? null, audience: m.audience ?? null, topic: m.topic ?? null,
  message: m.message, status: m.status, note: m.note ?? null, createdAt: m.createdAt, resolvedAt: m.resolvedAt ?? null,
  user: m.user ? { id: m.user.id, role: m.user.role } : null,
  replies: (m.replies || []).map((r) => ({ id: r.id, message: r.message, createdAt: r.createdAt, emailSent: r.emailSent })),
});

const withRelations = () => [
  { model: User, as: 'user', attributes: ['id', 'role'] },
  { model: SupportReply, as: 'replies', attributes: ['id', 'message', 'createdAt', 'emailSent'], separate: true, order: [['createdAt', 'ASC']] },
];

exports.adminList = async ({ status, audience, search, page, limit }) => {
  const where = {};
  if (status !== 'all') where.status = status;
  if (audience) where.audience = audience;
  if (search) {
    const term = `%${escapeLike(search)}%`;
    where[Op.or] = ['name', 'email', 'message', 'phone'].map((f) => ({ [f]: { [Op.iLike]: term } }));
  }
  const { rows, count } = await SupportMessage.findAndCountAll({
    where, include: withRelations(), distinct: true,
    order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit,
  });
  return { items: rows.map(toAdminDTO), meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};

// Solo abiertos: total y por tipo de remitente (los viejos sin audience cuentan como "otro")
exports.stats = async () => {
  const rows = await SupportMessage.findAll({
    where: { status: 'open' }, attributes: ['audience', [fn('COUNT', col('id')), 'n']], group: ['audience'], raw: true,
  });
  const byAudience = Object.fromEntries(AUDIENCES.map((a) => [a, 0]));
  let open = 0;
  rows.forEach((r) => {
    const n = Number(r.n);
    open += n;
    byAudience[r.audience || 'otro'] += n;
  });
  return { open, byAudience };
};

const findOr404 = async (id) => {
  const msg = await SupportMessage.findByPk(id, { include: withRelations() });
  if (!msg) throw AppError.notFound('Mensaje no encontrado');
  return msg;
};

const statusChange = (actor, status) => (status === 'resolved'
  ? { status, resolvedAt: new Date(), resolvedBy: actor.id }
  : { status, resolvedAt: null, resolvedBy: null });

exports.update = async (actor, id, { status, note }) => {
  const msg = await findOr404(id);
  await msg.update({ ...(status ? statusChange(actor, status) : {}), ...(note !== undefined ? { note } : {}) });
  await audit(actor, 'support.update', { type: 'support', id }, { status, noteChanged: note !== undefined });
  return toAdminDTO(await findOr404(id));
};

// Responde por correo (con Reply-To al buzón de soporte) y guarda la respuesta; si `resolve`, lo cierra
exports.reply = async (actor, id, { message, resolve }) => {
  const msg = await findOr404(id);
  let emailSent = false;
  if (mailer.isConfigured()) {
    try {
      await mailer.send({
        to: msg.email,
        replyTo: env.SUPPORT_EMAIL || undefined,
        subject: `Respuesta a tu mensaje — ${env.APP_NAME}`,
        html: `<p>Hola ${escapeHtml(msg.name)},</p>
          <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
          <p>— Equipo ${escapeHtml(env.APP_NAME)}</p>
          <hr><p style="color:#666;font-size:12px">Tu mensaje:</p>
          <p style="color:#666;font-size:12px;white-space:pre-wrap">${escapeHtml(msg.message)}</p>`,
      });
      emailSent = true;
    } catch (err) {
      logger.warn({ err, id }, 'No se pudo enviar la respuesta de soporte');
    }
  }
  await SupportReply.create({ messageId: msg.id, authorId: actor.id, message, emailSent });
  if (resolve) await msg.update(statusChange(actor, 'resolved'));
  await audit(actor, 'support.reply', { type: 'support', id }, { resolve, emailSent });
  return { ...toAdminDTO(await findOr404(id)), emailSent };
};
