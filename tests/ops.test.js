// Scripts operativos y límites de abuso
const { execFileSync } = require('child_process');
const path = require('path');
const { API, api, resetDb } = require('./helpers');
const { User } = require('../src/models');

beforeAll(resetDb);
const root = path.join(__dirname, '..');

describe('Scripts', () => {
  test('create-admin valida la contraseña y crea un admin que puede iniciar sesión', async () => {
    const run = (extra) => execFileSync(process.execPath, ['scripts/create-admin.js'], {
      cwd: root, env: { ...process.env, ADMIN_EMAIL: 'jefe@test.com', ...extra }, stdio: 'pipe',
    });
    expect(() => run({ ADMIN_PASSWORD: 'Corta1' })).toThrow();
    run({ ADMIN_PASSWORD: 'Admin-Seguro-2026', ADMIN_NAME: 'Jefe Admin' });
    expect((await User.findOne({ where: { email: 'jefe@test.com' } })).role).toBe('admin');
    await api().post(`${API}/auth/login`).send({ email: 'jefe@test.com', password: 'Admin-Seguro-2026' }).expect(200);
  });

  test('el seed de demo está bloqueado en producción', async () => {
    const seeder = require('../seeders/20260101000001-demo-data');
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(seeder.up({})).rejects.toThrow(/bloqueado en producción/);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  test('send-search-alerts sin SMTP termina limpio', () => {
    const out = execFileSync(process.execPath, ['scripts/send-search-alerts.js'], { cwd: root, env: process.env }).toString();
    expect(out).toContain('smtp-no-configurado');
  });
});

describe('Rate limits de endpoints públicos', () => {
  test('olvidé mi contraseña: 3 por hora', async () => {
    for (let i = 0; i < 3; i += 1) await api().post(`${API}/auth/forgot-password`).send({ email: 'a@test.com' }).expect(200);
    const res = await api().post(`${API}/auth/forgot-password`).send({ email: 'a@test.com' }).expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  test('newsletter: 5 por hora', async () => {
    for (let i = 0; i < 5; i += 1) await api().post(`${API}/newsletter/subscribe`).send({ email: `n${i}@test.com` }).expect(200);
    await api().post(`${API}/newsletter/subscribe`).send({ email: 'n9@test.com' }).expect(429);
  });

  test('login: bloquea tras 10 intentos fallidos', async () => {
    for (let i = 0; i < 10; i += 1) await api().post(`${API}/auth/login`).send({ email: 'x@test.com', password: 'Mala2026x' }).expect(401);
    await api().post(`${API}/auth/login`).send({ email: 'x@test.com', password: 'Mala2026x' }).expect(429);
  });
});
