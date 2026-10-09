// Catálogo de permisos del panel admin para las cuentas `staff`.
// Mismos identificadores que el frontend (src/lib/admin/permissions.ts). El rol `admin` los tiene todos.
const PERMISSIONS = {
  resumen: 'Ver el resumen',
  vendedores: 'Ver criaderos y verificarlos o revocarlos',
  usuarios: 'Ver la lista de cuentas',
  'usuarios.suspender': 'Suspender y reactivar cuentas (incluye usuarios)',
  citas: 'Ver todas las citas',
  veterinarias: 'Administrar veterinarias y solicitudes',
  calificaciones: 'Ver calificaciones con comentarios',
  soporte: 'Bandeja de soporte',
  roles: 'Crear y asignar roles',
};

// Permisos que incluyen a otros
const IMPLIES = { 'usuarios.suspender': ['usuarios'] };

const PERMISSION_KEYS = Object.keys(PERMISSIONS);

// Lista efectiva de permisos de un rol (con los implícitos)
const expand = (perms = []) => [...new Set(perms.flatMap((p) => [p, ...(IMPLIES[p] || [])]))];

module.exports = { PERMISSIONS, PERMISSION_KEYS, expand };
