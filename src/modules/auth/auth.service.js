const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { UniqueConstraintError } = require('sequelize');
const env = require('../../config/env');
const { User } = require('../../models');
const AppError = require('../../utils/AppError');
const { toUserDTO } = require('./auth.dto');

// Hash señuelo: mismo tiempo de respuesta exista o no el usuario (evita enumeración por timing)
const DUMMY_HASH = bcrypt.hashSync('patitas-dummy-password', 12);

const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
    algorithm: 'HS256', expiresIn: env.JWT_EXPIRES_IN, issuer: 'patitas-api',
  });

exports.register = async (data) => {
  try {
    const user = await User.create({ ...data, termsAcceptedAt: new Date(), termsVersion: '2026-01' });
    return { user: toUserDTO(user), token: signToken(user) };
  } catch (err) {
    if (err instanceof UniqueConstraintError) throw AppError.conflict('El correo ya está registrado');
    throw err; // sin pre-check findOne: elimina la condición de carrera
  }
};

exports.login = async ({ email, password }) => {
  const user = await User.scope('withPassword').findOne({ where: { email } });
  const ok = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  if (!user || !ok) throw AppError.unauthorized('Credenciales inválidas');
  return { user: toUserDTO(user), token: signToken(user) };
};