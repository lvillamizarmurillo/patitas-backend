const router = require('express').Router();
const ctrl = require('./contract.controller');
const { authMiddleware } = require('../../middlewares/auth.middleware');

router.get('/:appointmentId', authMiddleware, ctrl.download);
module.exports = router;