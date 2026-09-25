const router = require('express').Router();
const ctrl = require('./admin.controller');
const s = require('./admin.schemas');
const validate = require('../../middlewares/validate.middleware');
const { authMiddleware, requireRole } = require('../../middlewares/auth.middleware');

router.use(authMiddleware, requireRole('admin'));
router.get('/organizations', validate(s.listOrgs), ctrl.listOrganizations);
router.patch('/organizations/:id/verify', validate(s.verify), ctrl.verify);
router.patch('/organizations/:id/revoke', validate(s.verify), ctrl.revoke);

module.exports = router;