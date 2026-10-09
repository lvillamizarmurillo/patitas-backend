const { API, api, auth, resetDb, createUser, createPet, captureMail, book, waitFor } = require('./helpers');
const { Appointment, Pet } = require('../src/models');

let admin;
beforeAll(async () => {
  await resetDb();
  admin = await createUser({ role: 'admin' });
});

describe('Panel admin', () => {
  test('solo el rol admin entra', async () => {
    const user = await createUser();
    await api().get(`${API}/admin/users`).set(auth(user.token)).expect(403);
    await api().get(`${API}/admin/users`).expect(401);
  });

  test('GET /admin/users filtra por rol, búsqueda (con comodines escapados) y paginación', async () => {
    await createUser({ role: 'breeder', fullName: 'Criadero El Sol' });
    const byRole = await api().get(`${API}/admin/users?role=breeder`).set(auth(admin.token)).expect(200);
    expect(byRole.body.data.items.every((u) => u.role === 'breeder')).toBe(true);
    const bySearch = await api().get(`${API}/admin/users?search=el%20sol`).set(auth(admin.token)).expect(200);
    expect(bySearch.body.data.items.map((u) => u.fullName)).toEqual(['Criadero El Sol']);
    const wildcard = await api().get(`${API}/admin/users?search=%25`).set(auth(admin.token)).expect(200);
    expect(wildcard.body.data.meta.total).toBe(0);
    const page = await api().get(`${API}/admin/users?limit=1&page=1`).set(auth(admin.token)).expect(200);
    expect(page.body.data.items).toHaveLength(1);
    expect(page.body.data.items[0].password).toBeUndefined();
  });

  test('verificar organización envía correo y la marca verificada', async () => {
    const mails = captureMail();
    const org = await createUser({ role: 'shelter' });
    const res = await api().patch(`${API}/admin/organizations/${org.user.id}/verify`).set(auth(admin.token)).expect(200);
    expect(res.body.data.isVerified).toBe(true);
    await waitFor(() => mails.some((m) => m.to === org.user.email)); // el correo sale en segundo plano
  });

  test('GET /admin/appointments devuelve todas las citas con sus relaciones', async () => {
    const owner = await createUser({ role: 'shelter' });
    const adopter = await createUser();
    const pet = (await createPet(owner.token)).body.data;
    await book(adopter.token, pet).expect(201);
    const res = await api().get(`${API}/admin/appointments?status=pending`).set(auth(admin.token)).expect(200);
    const appt = res.body.data.items.find((a) => a.petId === pet.id);
    expect(appt.pet.owner.id).toBe(owner.user.id);
    expect(appt.adopter.id).toBe(adopter.user.id);
    expect(appt.clinic.id).toBe(pet.clinics[0].id);
  });
});

describe('Suspender y reactivar usuarios', () => {
  test('flujo completo', async () => {
    const mails = captureMail();
    const seller = await createUser({ role: 'breeder', isVerified: true });
    const buyer = await createUser();
    const pet = (await createPet(seller.token, { city: 'Manizales', breed: 'Husky' })).body.data;
    await api().post(`${API}/favorites/${pet.id}`).set(auth(buyer.token)).expect(201);
    const appt = (await book(buyer.token, pet).expect(201)).body.data;

    // Suspender
    const res = await api().patch(`${API}/admin/users/${seller.user.id}/suspend`).set(auth(admin.token))
      .send({ reason: 'Publicaciones engañosas' }).expect(200);
    expect(res.body.data).toMatchObject({ isSuspended: true, suspensionReason: 'Publicaciones engañosas' });
    const suspendMail = mails.find((m) => m.to === seller.user.email && m.subject === 'Tu cuenta fue suspendida');
    expect(suspendMail.html).toContain('Publicaciones engañosas');

    // El token que ya tenía deja de servir al instante; login y refresh bloqueados
    const me = await api().get(`${API}/auth/me`).set(auth(seller.token)).expect(403);
    expect(me.body.error.code).toBe('ACCOUNT_SUSPENDED');
    const login = await api().post(`${API}/auth/login`).send({ email: seller.user.email, password: seller.password }).expect(403);
    expect(login.body.error.code).toBe('ACCOUNT_SUSPENDED');
    const wrongPwd = await api().post(`${API}/auth/login`).send({ email: seller.user.email, password: 'Mala2026x' }).expect(401);
    expect(wrongPwd.body.error.code).toBe('UNAUTHORIZED'); // no revela la suspensión sin la contraseña
    const refreshCookie = seller.cookies.find((c) => c.startsWith('refreshToken=')).split(';')[0];
    await api().post(`${API}/auth/refresh`).set('Cookie', refreshCookie).expect(401);

    // Publicaciones ocultas en todos lados
    const list = await api().get(`${API}/pets`).expect(200);
    expect(list.body.data.items.find((p) => p.id === pet.id)).toBeUndefined();
    await api().get(`${API}/pets/${pet.id}`).expect(404);
    const favs = await api().get(`${API}/favorites`).set(auth(buyer.token)).expect(200);
    expect(favs.body.data.find((p) => p.id === pet.id)).toBeUndefined();
    const filters = await api().get(`${API}/catalogs/filters`).expect(200);
    expect(filters.body.data.cities).not.toContain('Manizales');

    // Cita cancelada y nadie puede agendar sobre sus mascotas
    expect((await Appointment.findByPk(appt.id)).status).toBe('cancelled');
    expect((await Pet.findByPk(pet.id)).status).toBe('available');
    const other = await createUser();
    await book(other.token, pet).expect(409);

    // Filtro de admin
    const suspended = await api().get(`${API}/admin/users?status=suspended`).set(auth(admin.token)).expect(200);
    expect(suspended.body.data.items.map((u) => u.id)).toEqual([seller.user.id]);

    // Idempotente y sin body
    await api().patch(`${API}/admin/users/${seller.user.id}/suspend`).set(auth(admin.token)).expect(200);

    // Reactivar
    const react = await api().patch(`${API}/admin/users/${seller.user.id}/reactivate`).set(auth(admin.token)).expect(200);
    expect(react.body.data.isSuspended).toBe(false);
    await api().post(`${API}/auth/login`).send({ email: seller.user.email, password: seller.password }).expect(200);
    await api().get(`${API}/pets/${pet.id}`).expect(200);
    expect(mails.filter((m) => m.to === seller.user.email).map((m) => m.subject)).toEqual(
      expect.arrayContaining(['Tu cuenta fue suspendida', 'Tu cuenta fue reactivada']));
  });

  test('no se puede suspender a un admin; usuario inexistente → 404', async () => {
    const other = await createUser({ role: 'admin' });
    await api().patch(`${API}/admin/users/${other.user.id}/suspend`).set(auth(admin.token)).expect(403);
    await api().patch(`${API}/admin/users/00000000-0000-4000-8000-000000000000/suspend`).set(auth(admin.token)).expect(404);
  });
});
