// Verifica la configuración SMTP y envía un correo de prueba.
//   node scripts/test-smtp.js destino@correo.com
const mailer = require('../src/utils/mailer');
const env = require('../src/config/env');

const to = process.argv[2];
if (!to) {
  console.error('Uso: node scripts/test-smtp.js destino@correo.com');
  process.exit(1);
}

(async () => {
  await mailer.verify();
  console.log(`✅ Conexión SMTP correcta (${env.SMTP_HOST}:${env.SMTP_PORT})`);
  await mailer.send({ to, subject: `Prueba SMTP — ${env.APP_NAME}`, html: '<p>Si lees esto, el correo del backend funciona. ✅</p>' });
  console.log(`✅ Correo de prueba enviado a ${to} desde ${env.MAIL_FROM}`);
})().catch((err) => {
  console.error('❌ SMTP falló:', err.message);
  process.exit(1);
});
