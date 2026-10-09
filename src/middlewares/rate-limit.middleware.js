const rateLimit = require('express-rate-limit');
const AppError = require('../utils/AppError');

const make = (windowMinutes, limit, extra = {}) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => next(AppError.tooMany()),
    ...extra,
  });

exports.globalLimiter = make(15, 300);
exports.loginLimiter = make(15, 10, { skipSuccessfulRequests: true });
exports.registerLimiter = make(60, 5);
exports.uploadLimiter = make(60, 20);
exports.appointmentLimiter = make(60, 30);
exports.forgotPasswordLimiter = make(60, 3);
exports.resetPasswordLimiter = make(60, 10);
exports.newsletterLimiter = make(60, 5);
exports.newsletterUnsubscribeLimiter = make(60, 5);
exports.supportLimiter = make(60, 5);
exports.alertLimiter = make(60, 20);
exports.clinicRequestLimiter = make(60, 5);
exports.reviewLimiter = make(60, 20);
