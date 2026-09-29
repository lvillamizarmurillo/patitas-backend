const router = require('express').Router();
const ctrl = require('./support.controller');
const s = require('./support.schemas');
const validate = require('../../middlewares/validate.middleware');
const { optionalAuth } = require('../../middlewares/auth.middleware');
const { supportLimiter } = require('../../middlewares/rate-limit.middleware');

router.post('/contact', supportLimiter, optionalAuth, validate(s.contact), ctrl.contact);

module.exports = router;
