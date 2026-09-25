const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { UniqueConstraintError } = require('sequelize');
const env = require('../../config/env');
const { User, RefreshToken } = require('../../models');
const AppError = require('../../utils/AppError');
const { toUserDTO } = require('./auth.dto');

const DUMMY_HASH = bcrypt.hashSync('patitas-dummy-password', 12);
const REFRESH_DAYS = 30;
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