const env = require('../config/env');
const logger = require('../config/logger');
const mailer = require('../utils/mailer');
const { runSearchAlertsDigest } = require('../modules/alerts/alert.digest');
const { runAppointmentJobs } = require('../modules/appointments/appointment.jobs');

// Tareas periódicas dentro del mismo proceso (sin cron externo).
// Si algún día hay varias réplicas, cada job usa un advisory lock de Postgres para no procesar dos veces.
const JOBS = [
  {
    name: 'citas (recordatorios, vencidas, sin cerrar, pagos, encuestas, contratos)',
    minutes: () => env.APPOINTMENT_JOBS_INTERVAL_MINUTES,
    run: runAppointmentJobs,
    report: (r) => Object.values(r).some((n) => typeof n === 'number' && n > 0),
  },
  {
    name: 'alertas de búsqueda',
    minutes: () => env.SEARCH_ALERTS_INTERVAL_MINUTES,
    run: runSearchAlertsDigest,
    report: (r) => r.enviadas,
  },
];

exports.start = () => {
  if (env.NODE_ENV === 'test') return () => {};
  const timers = JOBS.filter((job) => job.minutes() > 0).map((job) => {
    const tick = () => job.run()
      .then((r) => { if (job.report(r)) logger.info(r, `Job de ${job.name} ejecutado`); })
      .catch((err) => logger.error({ err }, `Falló el job de ${job.name}`));
    const timer = setInterval(tick, job.minutes() * 60000);
    timer.unref();
    logger.info({ cadaMinutos: job.minutes() }, `Job de ${job.name} programado`);
    return timer;
  });
  if (!mailer.isConfigured()) logger.warn('SMTP no configurado: las notificaciones quedan solo en la app y las alertas de búsqueda no se envían');
  return () => timers.forEach(clearInterval);
};
