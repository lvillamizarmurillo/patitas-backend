const { execFileSync } = require('child_process');
const path = require('path');
const { API, api } = require('./helpers');

describe('Sistema: health, errores, seguridad HTTP', () => {
  test('GET /health y /ready responden', async () => {
    await api().get('/health').expect(200, { status: 'ok' });
    await api().get('/ready').expect(200, { status: 'ready' });
  });

  test('ruta inexistente → 404 con el formato de error estándar', async () => {
    const res = await api().get(`${API}/no-existe`).expect(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: expect.stringContaining('Ruta no encontrada') },
      requestId: expect.any(String),
    });
  });

  test('JSON malformado → 400 y payload gigante → 413', async () => {
    await api().post(`${API}/auth/login`).set('Content-Type', 'application/json').send('{"email":').expect(400);
    await api().post(`${API}/auth/login`).send({ email: 'a@b.com', password: 'x'.repeat(20000) }).expect(413);
  });

  test('cabeceras de seguridad (Helmet) y no-store en la API', async () => {
    const res = await api().get(`${API}/catalogs/filters`).expect(200);
    expect(res.headers['strict-transport-security']).toContain('max-age=63072000');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('CORS: permite el origen configurado y rechaza otros', async () => {
    const ok = await api().get(`${API}/catalogs/filters`).set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const bad = await api().get(`${API}/catalogs/filters`).set('Origin', 'https://malicioso.com');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Validación de variables de entorno en producción', () => {
  const runEnv = (overrides) => {
    try {
      execFileSync(process.execPath, ['-e', "require('./src/config/env')"], {
        cwd: path.join(__dirname, '..'), env: { ...process.env, NODE_ENV: 'production', ...overrides }, stdio: 'pipe',
      });
      return { ok: true, out: '' };
    } catch (err) {
      return { ok: false, out: err.stderr.toString() };
    }
  };

  test('rechaza CORS con *, FRONTEND_URL http, storage local y JWT_SECRET de ejemplo', () => {
    const r = runEnv({
      CORS_ORIGINS: '*', FRONTEND_URL: 'http://puppymarketcol.com', STORAGE_DRIVER: 'local',
      JWT_SECRET: 'minimo_32_caracteres_para_produccion_cambia_esto',
    });
    expect(r.ok).toBe(false);
    expect(r.out).toContain('CORS_ORIGINS');
    expect(r.out).toContain('FRONTEND_URL');
    expect(r.out).toContain('STORAGE_DRIVER');
    expect(r.out).toContain('JWT_SECRET');
  });

  test('exige CLOUDINARY_URL con el driver cloudinary', () => {
    const r = runEnv({
      CORS_ORIGINS: 'https://puppymarketcol.com', FRONTEND_URL: 'https://puppymarketcol.com',
      STORAGE_DRIVER: 'cloudinary', CLOUDINARY_URL: '',
    });
    expect(r.ok).toBe(false);
    expect(r.out).toContain('CLOUDINARY_URL');
  });

  test('acepta una configuración de producción correcta', () => {
    const r = runEnv({
      CORS_ORIGINS: 'https://puppymarketcol.com,https://www.puppymarketcol.com', FRONTEND_URL: 'https://puppymarketcol.com',
      STORAGE_DRIVER: 'cloudinary', CLOUDINARY_URL: 'cloudinary://111:abc@demo',
    });
    expect(r).toEqual({ ok: true, out: '' });
  });
});
