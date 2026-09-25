const router = require('express').Router();
const ctrl = require('./auth.controller');
const s = require('./auth.schemas');
const validate = require('../../middlewares/validate.middleware');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { loginLimiter, registerLimiter } = require('../../middlewares/rate-limit.middleware');

router.post('/register', registerLimiter, validate(s.register), ctrl.register);
router.post('/login', loginLimiter, validate(s.login), ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', authMiddleware, ctrl.logout);
router.get('/me', authMiddleware, ctrl.me);

module.exports = router;