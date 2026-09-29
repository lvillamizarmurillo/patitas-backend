const router = require('express').Router();
const ctrl = require('./newsletter.controller');
const s = require('./newsletter.schemas');
const validate = require('../../middlewares/validate.middleware');
const { newsletterLimiter } = require('../../middlewares/rate-limit.middleware');

router.post('/subscribe', newsletterLimiter, validate(s.subscribe), ctrl.subscribe);
router.post('/unsubscribe', newsletterLimiter, validate(s.unsubscribe), ctrl.unsubscribe);

module.exports = router;
