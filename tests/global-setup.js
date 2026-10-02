// Una sola vez antes de toda la suite: deja el esquema de la BD de pruebas al día con las migraciones reales.
const { execFileSync } = require('child_process');

module.exports = async () => {
  require('./setup-env');
  execFileSync(process.execPath, [require.resolve('sequelize-cli/lib/sequelize'), 'db:migrate'], {
    env: process.env,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
};
