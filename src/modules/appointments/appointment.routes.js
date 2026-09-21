const router = require('express').Router();
const ctrl = require('./appointment.controller');
const s = require('./appointment.schemas');
const validate = require('../../middlewares/validate.middleware');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { appointmentLimiter } = require('../../middlewares/rate-limit.middleware');

router.use(authMiddleware);
router.post('/', appointmentLimiter, validate(s.create), ctrl.create);
router.get('/', validate(s.list), ctrl.list);
router.patch('/:id/status', validate(s.updateStatus), ctrl.updateStatus);

module.exports = router;