const AppError = require('../utils/AppError');
module.exports = (req, _res, next) => next(AppError.notFound(`Ruta no encontrada: ${req.method} ${req.path}`));