const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { User } = require('../models');

const readBearer = (req) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
};
const verify = (token) => {
  const p = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'patitas-api' });
  return { id: p.sub, role: p.role };
};

// Además del JWT se consulta el usuario: así una suspensión, un borrado o un cambio de rol
// surten efecto de inmediato y no hasta que venza el access token (15 min)
exports.authMiddleware = async (req, _res, next) => {
  const token = readBearer(req);
  if (!token) return next(AppError.unauthorized('Token no proporcionado'));
  let claims;
  try {
    claims = verify(token);
  } catch {
    return next(AppError.unauthorized('Token inválido o expirado'));
  }
  const user = await User.findByPk(claims.id, { attributes: ['id', 'role', 'suspendedAt'] });
  if (!user) return next(AppError.unauthorized('Sesión inválida'));
  if (user.suspendedAt) return next(AppError.suspended());
  req.user = { id: user.id, role: user.role };
  next();
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