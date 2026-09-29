const router = require('express').Router();
const ctrl = require('./contract.controller');
const { z } = require('zod');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const { uuid } = require('../../utils/schemas');

router.get('/:appointmentId', authMiddleware, validate({ params: z.object({ appointmentId: uuid }) }), ctrl.download);
module.exports = router;