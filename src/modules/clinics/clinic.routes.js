// Rutas públicas de veterinarias (la administración vive en admin.routes.js)
const router = require('express').Router();
const ctrl = require('./clinic.controller');
const s = require('./clinic.schemas');
const validate = require('../../middlewares/validate.middleware');
const { clinicRequestLimiter } = require('../../middlewares/rate-limit.middleware');

router.post('/requests', clinicRequestLimiter, validate(s.request), ctrl.request);

module.exports = router;
