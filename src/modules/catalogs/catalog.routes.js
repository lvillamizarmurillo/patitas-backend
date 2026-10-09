const router = require('express').Router();
const ctrl = require('./catalog.controller');
const validate = require('../../middlewares/validate.middleware');
const clinicSchemas = require('../clinics/clinic.schemas');

router.get('/filters', ctrl.getFilters);
router.get('/clinics', validate(clinicSchemas.publicList), ctrl.getClinics);
router.get('/pricing', ctrl.getPricing);
module.exports = router;