const router = require('express').Router();
const ctrl = require('./notification.controller');
const s = require('./notification.schemas');
const validate = require('../../middlewares/validate.middleware');
const { authMiddleware } = require('../../middlewares/auth.middleware');

router.use(authMiddleware);
router.get('/', validate(s.list), ctrl.list);
router.post('/read-all', ctrl.markAllRead);
router.patch('/:id/read', validate(s.byId), ctrl.markRead);

module.exports = router;
