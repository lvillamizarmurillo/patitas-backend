const pino = require('pino');
const env = require('./env');

// pino-pretty es devDependency: si no está instalado (imagen de producción) se loguea JSON plano
const hasPretty = (() => { try { require.resolve('pino-pretty'); return true; } catch { return false; } })();

module.exports = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: [
    'req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]',
    '*.password', '*.currentPassword', '*.newPassword', '*.token', '*.accessToken', '*.refreshToken',
  ],
  ...(env.NODE_ENV === 'development' && hasPretty && { transport: { target: 'pino-pretty' } }),
});