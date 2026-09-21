const router = require('express').Router();

router.use('/auth', require('../modules/auth/auth.routes'));
router.use('/pets', require('../modules/pets/pet.routes'));
router.use('/catalogs', require('../modules/catalogs/catalog.routes'));
router.use('/appointments', require('../modules/appointments/appointment.routes'));
router.use('/contracts', require('../modules/contracts/contract.routes'));
router.use('/dashboard', require('../modules/dashboard/dashboard.routes'));

module.exports = router;