const AppError = require('../utils/AppError');

module.exports = (schemas) => (req, _res, next) => {
  const issues = [];
  req.valid = {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part]);
    if (result.success) req.valid[part] = result.data;
    else issues.push(...result.error.issues.map((i) => ({ field: `${part}.${i.path.join('.')}`, message: i.message })));
  }
  if (issues.length) return next(AppError.badRequest('Datos inválidos', issues));
  next();
};