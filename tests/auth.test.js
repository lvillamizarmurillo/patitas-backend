const { API, api, auth, resetDb, createUser, captureMail } = require('./helpers');
const { RefreshToken, PasswordResetToken } = require('../src/models');

beforeAll(resetDb);

const cookieValue = (cookies) => cookies.find((c) => c.startsWith('refreshToken=')).split(';')[0];

describe('Registro', () => {
  const base = {
    role: 'adopter', fullName: 'Ana Pérez', city: 'Cali', email: 'ana.registro@test.com',
    phone: '+573001112233', password: 'Segura2026', termsAccepted: true,
  };

  test('registra, devuelve token y cookie httpOnly; nunca devuelve la contraseña', async () => {
    const res = await api().post(`${API}/auth/register`).send(base).expect(201);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ email: base.email, role: 'adopter', phone: base.phone, isVerified: false });
    expect(res.body.data.user.password).toBeUndefined();
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('refreshToken='));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  test('rechaza rol admin, contraseña débil, términos no aceptados y correo duplicado', async () => {
    await api().post(`${API}/auth/register`).send({ ...base, email: 'x1@test.com', role: 'admin' }).expect(400);
    await api().post(`${API}/auth/register`).send({ ...base, email: 'x2@test.com', password: 'debil' }).expect(400);
    await api().post(`${API}/auth/register`).send({ ...base, email: 'x3@test.com', termsAccepted: false }).expect(400);
    const dup = await api().post(`${API}/auth/register`).send(base).expect(409);
    expect(dup.body.error.message).toBe('El correo ya está registrado');
  });
});

describe('Login, refresh y logout', () => {
  test('login correcto / incorrecto con el mismo mensaje para correo inexistente', async () => {
    const { user, password } = await createUser();
    await api().post(`${API}/auth/login`).send({ email: user.email, password }).expect(200);
    const wrong = await api().post(`${API}/auth/login`).send({ email: user.email, password: 'Otra2026x' }).expect(401);
    const ghost = await api().post(`${API}/auth/login`).send({ email: 'nadie@test.com', password: 'Otra2026x' }).expect(401);
    expect(wrong.body.error.message).toBe(ghost.body.error.message);
  });

  test('refresh rota el token y reutilizar uno viejo revoca todas las sesiones', async () => {
    const { cookies } = await createUser();
    const old = cookieValue(cookies);
    const r1 = await api().post(`${API}/auth/refresh`).set('Cookie', old).expect(200);
    const fresh = cookieValue(r1.headers['set-cookie']);
    expect(fresh).not.toBe(old);

    await api().post(`${API}/auth/refresh`).set('Cookie', old).expect(401); // reutilización = robo
    await api().post(`${API}/auth/refresh`).set('Cookie', fresh).expect(401); // también quedó revocada
  });

  test('sin token → 401; token falso → 401', async () => {
    await api().get(`${API}/auth/me`).expect(401);
    await api().get(`${API}/auth/me`).set(auth('token.falso.x')).expect(401);
  });

  test('logout revoca el refresh token', async () => {
    const { token, cookies } = await createUser();
    await api().post(`${API}/auth/logout`).set(auth(token)).set('Cookie', cookieValue(cookies)).expect(204);
    await api().post(`${API}/auth/refresh`).set('Cookie', cookieValue(cookies)).expect(401);
  });
});

describe('Perfil (PATCH /auth/me)', () => {
  test('actualiza nombre/ciudad/teléfono e ignora campos no permitidos como role', async () => {
    const { token } = await createUser();
    const res = await api().patch(`${API}/auth/me`).set(auth(token))
      .send({ fullName: 'Nombre Nuevo', city: 'Medellín', phone: '+573009998877', role: 'admin' }).expect(200);
    expect(res.body.data).toMatchObject({ fullName: 'Nombre Nuevo', city: 'Medellín', phone: '+573009998877', role: 'adopter' });
  });

  test('body vacío → 400', async () => {
    const { token } = await createUser();
    await api().patch(`${API}/auth/me`).set(auth(token)).send({}).expect(400);
  });

  test('cambiar correo exige contraseña actual correcta y que no esté en uso', async () => {
    const other = await createUser();
    const { token, password } = await createUser();
    await api().patch(`${API}/auth/me`).set(auth(token)).send({ email: 'nuevo@test.com' }).expect(400);
    await api().patch(`${API}/auth/me`).set(auth(token)).send({ email: 'nuevo@test.com', currentPassword: 'Mala2026x' }).expect(400);
    await api().patch(`${API}/auth/me`).set(auth(token)).send({ email: other.user.email, currentPassword: password }).expect(409);
    const ok = await api().patch(`${API}/auth/me`).set(auth(token)).send({ email: 'nuevo@test.com', currentPassword: password }).expect(200);
    expect(ok.body.data.email).toBe('nuevo@test.com');
  });
});

describe('Cambio de contraseña', () => {
  test('exige la actual, mantiene la sesión actual y cierra las demás', async () => {
    const first = await createUser();
    const second = await api().post(`${API}/auth/login`).send({ email: first.user.email, password: first.password });

    await api().patch(`${API}/auth/me/password`).set(auth(first.token))
      .send({ currentPassword: 'Mala2026x', newPassword: 'Nueva2026x' }).expect(400);
    await api().patch(`${API}/auth/me/password`).set(auth(first.token)).set('Cookie', cookieValue(first.cookies))
      .send({ currentPassword: first.password, newPassword: 'Nueva2026x' }).expect(204);

    await api().post(`${API}/auth/refresh`).set('Cookie', cookieValue(first.cookies)).expect(200);
    await api().post(`${API}/auth/refresh`).set('Cookie', cookieValue(second.headers['set-cookie'])).expect(401);
    await api().post(`${API}/auth/login`).send({ email: first.user.email, password: 'Nueva2026x' }).expect(200);
  });
});

describe('Recuperación de contraseña', () => {
  test('responde igual exista o no el correo; envía enlace con FRONTEND_URL; token de un solo uso', async () => {
    const mails = captureMail();
    const { user, cookies } = await createUser();

    const ghost = await api().post(`${API}/auth/forgot-password`).send({ email: 'nadie@test.com' }).expect(200);
    const real = await api().post(`${API}/auth/forgot-password`).send({ email: user.email }).expect(200);
    expect(real.body).toEqual(ghost.body);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe(user.email);

    const token = mails[0].html.match(/reset-password\?token=([0-9a-f]{64})/)[1];
    expect(mails[0].html).toContain('https://puppymarketcol.com/reset-password?token=');
    const stored = await PasswordResetToken.findOne({ where: { userId: user.id } });
    expect(stored.tokenHash).not.toBe(token); // en BD solo el hash

    await api().post(`${API}/auth/reset-password`).send({ token, newPassword: 'Reset2026x' }).expect(200);
    await api().post(`${API}/auth/reset-password`).send({ token, newPassword: 'Reset2026y' }).expect(400);
    await api().post(`${API}/auth/refresh`).set('Cookie', cookieValue(cookies)).expect(401); // sesiones cerradas
    await api().post(`${API}/auth/login`).send({ email: user.email, password: 'Reset2026x' }).expect(200);
    expect(await RefreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(1);
  });

  test('token vencido o inventado → 400', async () => {
    const { user } = await createUser();
    const crypto = require('crypto');
    const raw = crypto.randomBytes(32).toString('hex');
    await PasswordResetToken.create({
      userId: user.id, tokenHash: crypto.createHash('sha256').update(raw).digest('hex'), expiresAt: new Date(Date.now() - 1000),
    });
    await api().post(`${API}/auth/reset-password`).send({ token: raw, newPassword: 'Reset2026x' }).expect(400);
    await api().post(`${API}/auth/reset-password`).send({ token: 'f'.repeat(64), newPassword: 'Reset2026x' }).expect(400);
  });
});
