const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const readBearer = (req) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
};
const verify = (token) => {
  const p = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'patitas-api' });
  return { id: p.sub, role: p.role };
};

exports.authMiddleware = (req, _res, next) => {
  const token = readBearer(req);
  if (!token) return next(AppError.unauthorized('Token no proporcionado'));
  try {
    req.user = verify(token);
    next();
  } catch {
    next(AppError.unauthorized('Token inválido o expirado'));
  }
};

// Para endpoints públicos: si llega un token válido se usa para enriquecer la petición, si no, se sigue como anónimo
exports.optionalAuth = (req, _res, next) => {
  const token = readBearer(req);
  if (token) {
    try { req.user = verify(token); } catch { /* token inválido/expirado: se trata como visitante */ }
  }
  next();
};

exports.requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(AppError.forbidden('Rol insuficiente'));