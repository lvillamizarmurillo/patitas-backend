const router = require('express').Router();
const ctrl = require('./favorite.controller');
const s = require('./favorite.schemas');
const validate = require('../../middlewares/validate.middleware');
const { authMiddleware } = require('../../middlewares/auth.middleware');

router.use(authMiddleware);
router.get('/', ctrl.list);
router.post('/:id', validate(s.petIdParam), ctrl.add);
router.delete('/:id', validate(s.petIdParam), ctrl.remove);

module.exports = router;