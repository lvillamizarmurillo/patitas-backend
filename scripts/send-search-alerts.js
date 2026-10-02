// Ejecuta a mano una corrida del job de alertas de búsqueda. El servidor ya lo corre solo cada
// SEARCH_ALERTS_INTERVAL_MINUTES; esto sirve para probar el SMTP o forzar un envío.
//   node scripts/send-search-alerts.js
const { sequelize } = require('../src/models');
const { runSearchAlertsDigest } = require('../src/modules/alerts/alert.digest');

runSearchAlertsDigest()
  .then((r) => console.log('✅', r))
  .catch((err) => { console.error('❌', err.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
