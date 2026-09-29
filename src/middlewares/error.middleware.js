const multer = require('multer');
const { ValidationError, UniqueConstraintError, ForeignKeyConstraintError, DatabaseError } = require('sequelize');
const AppError = require('../utils/AppError');

function normalize(err) {
  if (err instanceof AppError) return err;
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return new AppError('La imagen supera los 5 MB', 413, 'FILE_TOO_LARGE');
    if (err.code === 'LIMIT_FILE_COUNT') return AppError.badRequest('Máximo 5 imágenes por publicación');
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return AppError.badRequest(`Campo de imagen no permitido o con demasiados archivos: "${err.field}"`);
    }
    return AppError.badRequest(`Error al subir el archivo (${err.code})`);
  }
  if (err.type === 'entity.too.large') return new AppError('Payload demasiado grande', 413, 'PAYLOAD_TOO_LARGE');
  if (err.type === 'entity.parse.failed') return AppError.badRequest('JSON malformado');
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
  if (!known) (req.log || console).error({ err }, 'Error no controlado');
  const e = known || new AppError('Error interno del servidor', 500, 'INTERNAL_ERROR');
  res.status(e.status).json({ error: { code: e.code, message: e.message, details: e.details }, requestId: req.id });
};