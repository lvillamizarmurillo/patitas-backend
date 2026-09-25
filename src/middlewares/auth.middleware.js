const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');

exports.authMiddleware = (req, _res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return next(AppError.unauthorized('Token no proporcionado'));
  try {
    const p = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'patitas-api' });
    req.user = { id: p.sub, role: p.role };
    next();
  } catch {
    next(AppError.unauthorized('Token inválido o expirado'));
  }
};

exports.requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(AppError.forbidden('Rol insuficiente'));