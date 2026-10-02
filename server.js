const env = require('./src/config/env');
const logger = require('./src/config/logger');
const app = require('./src/app');
const { sequelize } = require('./src/models');
const scheduler = require('./src/jobs/scheduler');

async function start() {
  await sequelize.authenticate();
  logger.info('🐘 Conexión a la base de datos establecida.');

  const server = app.listen(env.PORT, () => logger.info(`🚀 API en puerto ${env.PORT}`));
  const stopJobs = scheduler.start();

  const shutdown = (signal) => {
    logger.info({ signal }, 'Cerrando servidor...');
    stopJobs();
    server.close(async () => {
      await require('./src/modules/contracts/pdf.service').close();
      await sequelize.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (err) => { logger.fatal({ err }, 'unhandledRejection'); process.exit(1); });
start().catch((err) => { logger.fatal({ err }, 'Error al iniciar'); process.exit(1); });