// Variables de entorno de la suite. Se cargan ANTES de cualquier require de la app.
// Los tests VACÍAN la base de datos: por eso exigen una URL explícita y que el nombre de la BD contenga "test".
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Define TEST_DATABASE_URL con una BD desechable (los tests la vacían). Ver README §3.1.');
if (!/test/i.test(new URL(url).pathname)) throw new Error('Por seguridad, el nombre de la BD de pruebas debe contener "test".');

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: url,
  DB_SSL: 'false',
  JWT_SECRET: 'b7f3c9e1a4d8f2b6c0e5a9d3f7b1c5e9a2d6f0b4c8e3a7d1',
  STORAGE_DRIVER: 'local',
  CORS_ORIGINS: 'http://localhost:5173',
  FRONTEND_URL: 'https://puppymarketcol.com',
  SMTP_HOST: '', // los correos se capturan con un spy (ver helpers.captureMail)
  SUPPORT_EMAIL: 'soporte@puppymarketcol.com',
  MAIL_FROM: 'no-reply@puppymarketcol.com',
  APP_NAME: 'PuppyMarket',
  SEARCH_ALERTS_INTERVAL_MINUTES: '0',
  SEARCH_ALERTS_COOLDOWN_HOURS: '24',
  COOKIE_SAMESITE: 'strict',
  TRUST_PROXY: '1',
});
