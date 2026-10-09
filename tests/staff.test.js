// Punto 17: roles del equipo con permisos (y auditoría de lo que hace el panel)
const { API, api, auth, resetDb, createUser } = require('./helpers');
const { AuditLog, User } = require('../src/models');

let admin;
beforeAll(async () => {
  await resetDb();
  admin = await createUser({ role: 'admin' });
});

const createRole = (body, token = admin.token) => api().post(`${API}/admin/roles`).set(auth(token)).send(body);
const assign = (userId, roleId, token = admin.token) => api().patch(`${API}/admin/users/${userId}/staff-role`).set(auth(token)).send({ roleId });
const login = (u) => api().post(`${API}/auth/login`).send({ email: u.user.email, password: u.password });

describe('Roles', () => {
  test('crear valida nombre único (sin importar mayúsculas) y permisos del catálogo; editar y borrar', async () => {
    const role = (await createRole({ name: 'Verificador', description: 'Revisa criaderos', permissions: ['vendedores', 'vendedores'] }).expect(201)).body.data;
    expect(role).toMatchObject({ name: 'Verificador', permissions: ['vendedores'], memberCount: 0 });
    await createRole({ name: 'verificador', permissions: ['citas'] }).expect(409);
    await createRole({ name: 'Raro', permissions: ['hackear'] }).expect(400);
    await createRole({ name: 'Vacío', permissions: [] }).expect(400);

    const edited = await api().patch(`${API}/admin/roles/${role.id}`).set(auth(admin.token)).send({ permissions: ['vendedores', 'citas'] }).expect(200);
    expect(edited.body.data.permissions).toEqual(['vendedores', 'citas']);

    const temp = (await createRole({ name: 'Temporal', permissions: ['resumen'] })).body.data;
    await api().delete(`${API}/admin/roles/${temp.id}`).set(auth(admin.token)).expect(204);
  });

  test('asignar: la cuenta pasa a staff, ve sus permisos en login, refresh y /auth/me; no se puede borrar un rol con personas', async () => {
    const role = (await createRole({ name: 'Soporte y usuarios', permissions: ['soporte', 'usuarios.suspender'] })).body.data;
    const member = await createUser({ role: 'individual' });
    const res = await assign(member.user.id, role.id).expect(200);
    expect(res.body.data).toMatchObject({ role: 'staff', staffRole: { id: role.id, name: 'Soporte y usuarios' } });

    const l = await login(member).expect(200);
    expect(l.body.data.user).toMatchObject({ role: 'staff', permissions: expect.arrayContaining(['soporte', 'usuarios.suspender', 'usuarios']) });
    const me = await api().get(`${API}/auth/me`).set(auth(l.body.data.accessToken)).expect(200);
    expect(me.body.data.permissions).toEqual(expect.arrayContaining(['soporte', 'usuarios.suspender', 'usuarios']));
    const cookie = l.headers['set-cookie'].find((c) => c.startsWith('refreshToken=')).split(';')[0];
    const refreshed = await api().post(`${API}/auth/refresh`).set('Cookie', cookie).expect(200);
    expect(refreshed.body.data.user.permissions).toContain('soporte');

    await api().delete(`${API}/admin/roles/${role.id}`).set(auth(admin.token)).expect(409);
    const list = (await api().get(`${API}/admin/roles`).set(auth(admin.token)).expect(200)).body.data;
    expect(list.roles.find((r) => r.id === role.id).memberCount).toBe(1);
    expect(list.members).toEqual([expect.objectContaining({ id: member.user.id, staffRole: { id: role.id, name: 'Soporte y usuarios' } })]);
    expect(list.permissions.map((p) => p.key)).toContain('roles');

    // GET /admin/users trae staffRole y filtra por role=staff
    const users = (await api().get(`${API}/admin/users?role=staff`).set(auth(admin.token))).body.data.items;
    expect(users).toEqual([expect.objectContaining({ id: member.user.id, staffRole: { id: role.id, name: 'Soporte y usuarios' } })]);
  });

  test('requirePermission protege cada ruta del panel (la protección real, no solo el frontend)', async () => {
    const role = (await createRole({ name: 'Solo vendedores', permissions: ['vendedores'] })).body.data;
    const member = await createUser();
    await assign(member.user.id, role.id).expect(200);
    const token = (await login(member)).body.data.accessToken;

    await api().get(`${API}/admin/organizations`).set(auth(token)).expect(200);
    await api().get(`${API}/admin/users`).set(auth(token)).expect(403);
    await api().get(`${API}/admin/appointments`).set(auth(token)).expect(403);
    await api().get(`${API}/admin/roles`).set(auth(token)).expect(403);
    await api().get(`${API}/admin/payments`).set(auth(token)).expect(403); // dinero: solo el admin principal
    await api().get(`${API}/admin/audit`).set(auth(token)).expect(403);

    // El cambio de permisos aplica en la siguiente petición, sin esperar a que venza el token
    await api().patch(`${API}/admin/roles/${role.id}`).set(auth(admin.token)).send({ permissions: ['usuarios'] }).expect(200);
    await api().get(`${API}/admin/users`).set(auth(token)).expect(200);
    await api().get(`${API}/admin/organizations`).set(auth(token)).expect(403);

    // Un comprador normal no entra al panel
    const buyer = await createUser();
    await api().get(`${API}/admin/organizations`).set(auth(buyer.token)).expect(403);
  });

  test('no se aplica al admin ni a uno mismo; quitar el rol devuelve el rol anterior y cierra sus sesiones', async () => {
    const role = (await createRole({ name: 'Roles', permissions: ['roles'] })).body.data;
    const other = await createUser({ role: 'admin' });
    await assign(other.user.id, role.id).expect(403);

    const manager = await createUser();
    await assign(manager.user.id, role.id).expect(200);
    const mToken = (await login(manager)).body.data.accessToken;
    await assign(manager.user.id, null, mToken).expect(403); // a sí mismo no

    const seller = await createUser({ role: 'breeder' });
    await assign(seller.user.id, role.id, mToken).expect(200); // con permiso `roles` puede asignar
    expect((await User.findByPk(seller.user.id)).previousRole).toBe('breeder');
    const removed = await assign(seller.user.id, null).expect(200);
    expect(removed.body.data).toMatchObject({ role: 'breeder', staffRole: null });
    const cookie = seller.cookies.find((c) => c.startsWith('refreshToken=')).split(';')[0];
    await api().post(`${API}/auth/refresh`).set('Cookie', cookie).expect(401); // sesiones cerradas al cambiar el rol
  });

  test('auditoría: queda registro de roles, asignaciones y suspensiones; solo el admin la ve', async () => {
    const victim = await createUser();
    await api().patch(`${API}/admin/users/${victim.user.id}/suspend`).set(auth(admin.token)).send({ reason: 'Spam' }).expect(200);
    const actions = (await AuditLog.findAll()).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['role.create', 'role.update', 'role.delete', 'role.assign', 'user.suspend']));
    const res = (await api().get(`${API}/admin/audit?action=role.`).set(auth(admin.token)).expect(200)).body.data;
    expect(res.items.every((i) => i.action.startsWith('role.'))).toBe(true);
    expect(res.items[0].actor).toEqual(expect.objectContaining({ fullName: expect.any(String) }));
  });
});
