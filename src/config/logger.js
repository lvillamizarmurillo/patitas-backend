const pino = require('pino');
const env = require('./env');

module.exports = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password'],
  ...(env.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
});