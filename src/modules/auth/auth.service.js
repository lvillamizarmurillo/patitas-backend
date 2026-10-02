const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Op, UniqueConstraintError } = require('sequelize');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { sequelize, User, RefreshToken, PasswordResetToken } = require('../../models');
const AppError = require('../../utils/AppError');
const mailer = require('../../utils/mailer');
const { escapeHtml } = require('../../utils/escape');
const { toUserDTO } = require('./auth.dto');

const DUMMY_HASH = bcrypt.hashSync('patitas-dummy-password', 12);
const REFRESH_DAYS = 30;
const RESET_TOKEN_MINUTES = 60;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const signAccessToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
    algorithm: 'HS256', expiresIn: env.JWT_EXPIRES_IN, issuer: 'patitas-api',
  });

const issueRefreshToken = async (userId, userAgent) => {
  const raw = crypto.randomBytes(48).toString('hex');
  await RefreshToken.create({
    userId, tokenHash: sha256(raw), userAgent,
    expiresAt: new Date(Date.now() + REFRESH_DAYS * 86400000),
  });
  return raw;
};

exports.register = async (data, userAgent) => {
  try {
    const user = await User.create({ ...data, termsAcceptedAt: new Date(), termsVersion: '2026-01' });
    return { user: toUserDTO(user), accessToken: signAccessToken(user), refreshToken: await issueRefreshToken(user.id, userAgent) };
  } catch (err) {
    if (err instanceof UniqueConstraintError) throw AppError.conflict('El correo ya está registrado');
    throw err;
  }
};

exports.login = async ({ email, password }, userAgent) => {
  const user = await User.scope('withPassword').findOne({ where: { email } });
  const ok = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  if (!user || !ok) throw AppError.unauthorized('Credenciales inválidas');
  // Se revisa después de la contraseña para no revelar a terceros qué cuentas están suspendidas
  if (user.suspendedAt) throw AppError.suspended();
  return { user: toUserDTO(user), accessToken: signAccessToken(user), refreshToken: await issueRefreshToken(user.id, userAgent) };
};

exports.refresh = async (rawToken, userAgent) => {
  if (!rawToken) throw AppError.unauthorized('Falta el refresh token');
  const hash = sha256(rawToken);
  const stored = await RefreshToken.findOne({ where: { tokenHash: hash } });

  if (!stored || stored.expiresAt < new Date()) throw AppError.unauthorized('Sesión expirada');
  if (stored.revokedAt) {
    await RefreshToken.update({ revokedAt: new Date() }, { where: { userId: stored.userId, revokedAt: null } });
    throw AppError.unauthorized('Sesión inválida, vuelve a iniciar sesión');
  }

  const user = await User.findByPk(stored.userId);
  if (!user) throw AppError.unauthorized('Sesión inválida');
  if (user.suspendedAt) throw AppError.suspended();

  const newRaw = crypto.randomBytes(48).toString('hex');
  await RefreshToken.create({
    userId: user.id, tokenHash: sha256(newRaw), userAgent,
    expiresAt: new Date(Date.now() + REFRESH_DAYS * 86400000),
  });
  await stored.update({ revokedAt: new Date(), replacedByTokenHash: sha256(newRaw) });

  return { accessToken: signAccessToken(user), refreshToken: newRaw };
};

exports.logout = async (rawToken) => {
  if (!rawToken) return;
  await RefreshToken.update({ revokedAt: new Date() }, { where: { tokenHash: sha256(rawToken) } });
};

exports.me = async (userId) => {
  const user = await User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuario no encontrado');
  return toUserDTO(user);
};

// 400 y no 401: un 401 haría que el frontend intente refrescar la sesión o cerrarla
const wrongPassword = () =>
  AppError.badRequest('La contraseña actual es incorrecta', [{ field: 'body.currentPassword', message: 'Contraseña incorrecta' }]);

exports.updateMe = async (userId, { currentPassword, ...changes }) => {
  const user = await User.scope('withPassword').findByPk(userId);
  if (!user) throw AppError.notFound('Usuario no encontrado');

  // Cambiar el correo equivale a cambiar el login: se exige la contraseña actual
  if (changes.email && changes.email !== user.email) {
    if (!currentPassword) {
      throw AppError.badRequest('Para cambiar el correo debes confirmar tu contraseña actual',
        [{ field: 'body.currentPassword', message: 'Requerida para cambiar el correo' }]);
    }
    if (!(await bcrypt.compare(currentPassword, user.password))) throw wrongPassword();
  }

  try {
    await user.update(changes);
  } catch (err) {
    if (err instanceof UniqueConstraintError) throw AppError.conflict('El correo ya está registrado');
    throw err;
  }
  return toUserDTO(user);
};

// Cambia la contraseña y cierra las demás sesiones, dejando viva solo la del dispositivo actual
exports.changePassword = async (userId, { currentPassword, newPassword }, currentRefreshToken) => {
  const user = await User.scope('withPassword').findByPk(userId);
  if (!user) throw AppError.notFound('Usuario no encontrado');
  if (!(await bcrypt.compare(currentPassword, user.password))) throw wrongPassword();

  await sequelize.transaction(async (t) => {
    await user.update({ password: newPassword }, { transaction: t });
    const where = { userId, revokedAt: null };
    if (currentRefreshToken) where.tokenHash = { [Op.ne]: sha256(currentRefreshToken) };
    await RefreshToken.update({ revokedAt: new Date() }, { where, transaction: t });
  });
};

// Nunca revela si el correo existe: el controller responde lo mismo en ambos casos
exports.forgotPassword = async ({ email }) => {
  const user = await User.findOne({ where: { email } });
  if (!user || user.suspendedAt) return;

  const raw = crypto.randomBytes(32).toString('hex');
  await sequelize.transaction(async (t) => {
    // Un solo enlace vigente por usuario: los anteriores quedan invalidados
    await PasswordResetToken.update({ usedAt: new Date() }, { where: { userId: user.id, usedAt: null }, transaction: t });
    await PasswordResetToken.create({
      userId: user.id, tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60000),
    }, { transaction: t });
  });

  const link = `${env.FRONTEND_URL.replace(/\/$/, '')}/reset-password?token=${raw}`;
  if (env.NODE_ENV === 'development') logger.info({ link }, 'Enlace de recuperación (solo visible en desarrollo)');
  mailer.send({
    to: user.email,
    subject: `Recupera tu contraseña de ${env.APP_NAME}`,
    html: `<p>Hola ${escapeHtml(user.fullName)},</p>
      <p>Recibimos una solicitud para restablecer tu contraseña. Este enlace vence en ${RESET_TOKEN_MINUTES} minutos:</p>
      <p><a href="${link}">Restablecer contraseña</a></p>
      <p>Si no fuiste tú, ignora este correo: tu contraseña no cambiará.</p>`,
  }).catch((err) => logger.warn({ err }, 'No se pudo enviar el correo de recuperación'));
};

exports.resetPassword = ({ token, newPassword }) =>
  sequelize.transaction(async (t) => {
    const invalid = () => AppError.badRequest('El enlace es inválido o ya expiró');
    const record = await PasswordResetToken.findOne({
      where: { tokenHash: sha256(token) }, transaction: t, lock: t.LOCK.UPDATE,
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) throw invalid();

    const user = await User.findByPk(record.userId, { transaction: t });
    if (!user) throw invalid();

    await user.update({ password: newPassword }, { transaction: t });
    await record.update({ usedAt: new Date() }, { transaction: t });
    // Si alguien robó la cuenta, lo sacamos de todos los dispositivos
    await RefreshToken.update({ revokedAt: new Date() }, { where: { userId: user.id, revokedAt: null }, transaction: t });
  });
