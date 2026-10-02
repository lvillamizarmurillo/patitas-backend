const env = require('../config/env');
const logger = require('../config/logger');
const mailer = require('../utils/mailer');
const { runSearchAlertsDigest } = require('../modules/alerts/alert.digest');

// Tareas periódicas dentro del mismo proceso (sin cron externo).
// Si algún día hay varias réplicas, el advisory lock del digest evita envíos duplicados.
exports.start = () => {
  const minutes = env.SEARCH_ALERTS_INTERVAL_MINUTES;
  if (env.NODE_ENV === 'test' || minutes === 0) return () => {};

  const run = () => runSearchAlertsDigest()
    .then((r) => { if (r.enviadas) logger.info(r, 'Alertas de búsqueda enviadas'); })
    .catch((err) => logger.error({ err }, 'Falló el job de alertas de búsqueda'));

  const timer = setInterval(run, minutes * 60000);
  timer.unref();
  logger.info({ cadaMinutos: minutes, smtp: mailer.isConfigured() }, 'Job de alertas de búsqueda programado');
  return () => clearInterval(timer);
};
