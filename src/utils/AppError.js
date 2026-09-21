class AppError extends Error {
  constructor(message, status = 500, code = 'INTERNAL_ERROR', details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
  static badRequest(m, d) { return new AppError(m, 400, 'BAD_REQUEST', d); }
  static unauthorized(m = 'No autorizado') { return new AppError(m, 401, 'UNAUTHORIZED'); }
  static forbidden(m = 'Acceso denegado') { return new AppError(m, 403, 'FORBIDDEN'); }
  static notFound(m = 'Recurso no encontrado') { return new AppError(m, 404, 'NOT_FOUND'); }
  static conflict(m) { return new AppError(m, 409, 'CONFLICT'); }
  static tooMany(m = 'Demasiadas solicitudes') { return new AppError(m, 429, 'RATE_LIMITED'); }
}
module.exports = AppError;