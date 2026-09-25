const router = require('express').Router();
const ctrl = require('./catalog.controller');
router.get('/filters', ctrl.getFilters);
router.get('/clinics', ctrl.getClinics);
module.exports = router;