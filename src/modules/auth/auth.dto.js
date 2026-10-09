exports.toUserDTO = (u, permissions) => ({
  id: u.id, fullName: u.fullName, email: u.email, phone: u.phone, role: u.role, city: u.city, isVerified: Boolean(u.isVerified),
  // Solo cuentas del equipo: lo que pueden hacer en el panel admin
  ...(u.role === 'staff' ? { permissions: permissions || [] } : {}),
});
