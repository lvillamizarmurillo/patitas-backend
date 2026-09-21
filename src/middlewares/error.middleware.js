const multer = require('multer');
const { ValidationError, UniqueConstraintError, ForeignKeyConstraintError, DatabaseError } = require('sequelize');
const AppError = require('../utils/AppError');

function normalize(err) {
  if (err instanceof AppError) return err;
  if (err instanceof multer.MulterError) {
    return err.code === 'LIMIT_FILE_SIZE'
      ? new AppError('La imagen supera los 5 MB', 413, 'FILE_TOO_LARGE')
      : AppError.badRequest(`Error al subir el archivo (${err.code})`);
  }
  if (err.type === 'entity.too.large') return new AppError('Payload demasiado grande', 413, 'PAYLOAD_TOO_LARGE');
  if (err.type === 'entity.parse.failed') return AppError.badRequest('JSON malformado');
  // Orden importa: UniqueConstraintError extiende ValidationError; FK extiende DatabaseError
  if (err instanceof UniqueConstraintError) return AppError.conflict('El registro ya existe');
  if (err instanceof ForeignKeyConstraintError) return AppError.badRequest('Referencia inválida');
  if (err instanceof ValidationError) {
    return AppError.badRequest('Datos inválidos', err.errors.map((e) => ({ field: e.path, message: e.message })));
  }
  if (err instanceof DatabaseError && /invalid input syntax for type uuid/.test(err.message)) {
    return AppError.badRequest('ID inválido');
  }
  return null;
}

module.exports = (err, req, res, _next) => {
  const known = normalize(err);
  if (!known) req.log.error({ err }, 'Error no controlado');
  const e = known || new AppError('Error interno del servidor', 500, 'INTERNAL_ERROR');
  res.status(e.status).json({
    error: { code: e.code, message: e.message, details: e.details },
    requestId: req.id,
  });
};