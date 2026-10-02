const router = require('express').Router();
const ctrl = require('./alert.controller');
const s = require('./alert.schemas');
const validate = require('../../middlewares/validate.middleware');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { alertLimiter } = require('../../middlewares/rate-limit.middleware');

router.use(authMiddleware);
router.post('/', alertLimiter, validate(s.create), ctrl.create);
router.get('/', ctrl.list);
router.delete('/:id', validate(s.byId), ctrl.remove);

module.exports = router;
