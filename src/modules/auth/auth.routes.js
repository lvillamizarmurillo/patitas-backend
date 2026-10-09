const router = require('express').Router();
const ctrl = require('./auth.controller');
const s = require('./auth.schemas');
const validate = require('../../middlewares/validate.middleware');
const { authMiddleware, requireRole } = require('../../middlewares/auth.middleware');
const {
  loginLimiter, registerLimiter, forgotPasswordLimiter, resetPasswordLimiter,
} = require('../../middlewares/rate-limit.middleware');

router.post('/register', registerLimiter, validate(s.register), ctrl.register);
router.post('/login', loginLimiter, validate(s.login), ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', authMiddleware, ctrl.logout);
router.get('/me', authMiddleware, ctrl.me);
router.patch('/me', authMiddleware, validate(s.updateMe), ctrl.updateMe);
router.patch('/me/password', authMiddleware, validate(s.changePassword), ctrl.changePassword);
const sellers = requireRole('shelter', 'breeder', 'individual');
router.get('/me/payout-info', authMiddleware, sellers, ctrl.getPayoutInfo);
router.put('/me/payout-info', authMiddleware, sellers, validate(s.payoutInfo), ctrl.setPayoutInfo);
router.post('/forgot-password', forgotPasswordLimiter, validate(s.forgotPassword), ctrl.forgotPassword);
router.post('/reset-password', resetPasswordLimiter, validate(s.resetPassword), ctrl.resetPassword);

module.exports = router;