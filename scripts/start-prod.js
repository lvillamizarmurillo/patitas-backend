// Arranque de producción: aplica las migraciones pendientes y luego levanta la API.
// Se usa como CMD del Dockerfile para que cada deploy deje el esquema al día sin pasos manuales.
// Desactivar con RUN_MIGRATIONS=false (ej. si algún día corren varias réplicas y migran aparte).
const { execFileSync } = require('child_process');

// Valida las variables de entorno ANTES de tocar la BD (si algo falta, sale con el detalle)
require('../src/config/env');

if (process.env.RUN_MIGRATIONS !== 'false') {
  console.log('▶ Aplicando migraciones pendientes...');
  execFileSync(process.execPath, [require.resolve('sequelize-cli/lib/sequelize'), 'db:migrate'], { stdio: 'inherit' });
}

require('../server');
