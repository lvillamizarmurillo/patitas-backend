// Panel admin. Entra el rol `admin` (todo) y el rol `staff` (solo con el permiso de cada ruta).
// requirePermission es la protección real: el frontend solo esconde pestañas y botones.
const router = require('express').Router();
const ctrl = require('./admin.controller');
const s = require('./admin.schemas');
const validate = require('../../middlewares/validate.middleware');
const { authMiddleware, requireRole, requirePermission, requireAdmin } = require('../../middlewares/auth.middleware');

const clinics = require('../clinics/clinic.controller');
const clinicSchemas = require('../clinics/clinic.schemas');
const reviews = require('../reviews/review.controller');
const reviewSchemas = require('../reviews/review.schemas');
const support = require('../support/support.controller');
const supportSchemas = require('../support/support.schemas');
const staff = require('../staff/staff.controller');
const staffSchemas = require('../staff/staff.schemas');

const can = requirePermission;

router.use(authMiddleware, requireRole('admin', 'staff'));

router.get('/summary', can('resumen'), ctrl.summary);

// Vendedores (verificación)
router.get('/organizations', can('vendedores'), validate(s.listOrgs), ctrl.listOrganizations);
router.patch('/organizations/:id/verify', can('vendedores'), validate(s.verify), ctrl.verify);
router.patch('/organizations/:id/revoke', can('vendedores'), validate(s.verify), ctrl.revoke);

// Usuarios
router.get('/users', can('usuarios'), validate(s.listUsers), ctrl.listUsers);
router.patch('/users/:id/suspend', can('usuarios.suspender'), validate(s.suspend), ctrl.suspend);
router.patch('/users/:id/reactivate', can('usuarios.suspender'), validate(s.reactivate), ctrl.reactivate);
router.patch('/users/:id/staff-role', can('roles'), validate(staffSchemas.assign), staff.assign);

// Citas
router.get('/appointments', can('citas'), validate(s.listAppointments), ctrl.listAppointments);

// Veterinarias
router.get('/clinics', can('veterinarias'), validate(clinicSchemas.list), clinics.list);
router.post('/clinics', can('veterinarias'), validate(clinicSchemas.create), clinics.create);
router.patch('/clinics/:id', can('veterinarias'), validate(clinicSchemas.update), clinics.update);
router.patch('/clinics/:id/approve', can('veterinarias'), validate(clinicSchemas.byId), clinics.approve);
router.patch('/clinics/:id/reject', can('veterinarias'), validate(clinicSchemas.reject), clinics.reject);

// Calificaciones
router.get('/reviews', can('calificaciones'), validate(reviewSchemas.adminList), reviews.adminList);
router.patch('/reviews/:id', can('calificaciones'), validate(reviewSchemas.hide), reviews.setHidden);

// Soporte
router.get('/support', can('soporte'), validate(supportSchemas.adminList), support.adminList);
router.get('/support/stats', can('soporte'), support.stats);
router.patch('/support/:id', can('soporte'), validate(supportSchemas.adminUpdate), support.update);
router.post('/support/:id/reply', can('soporte'), validate(supportSchemas.adminReply), support.reply);

// Roles del equipo
router.get('/roles', can('roles'), staff.list);
router.post('/roles', can('roles'), validate(staffSchemas.create), staff.create);
router.patch('/roles/:id', can('roles'), validate(staffSchemas.update), staff.update);
router.delete('/roles/:id', can('roles'), validate(staffSchemas.byId), staff.remove);

// Dinero y auditoría: solo el admin principal
router.get('/payments', requireAdmin, validate(s.listPayments), ctrl.listPayments);
router.patch('/payments/:id/refund', requireAdmin, validate(s.updateRefund), ctrl.updateRefund);
router.get('/payouts', requireAdmin, validate(s.listPayouts), ctrl.listPayouts);
router.patch('/payouts/:id/paid', requireAdmin, validate(s.markPayoutPaid), ctrl.markPayoutPaid);
router.get('/audit', requireAdmin, validate(s.listAudit), ctrl.listAudit);

module.exports = router;
