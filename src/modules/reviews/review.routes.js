// Rutas de calificaciones para compradores y vendedores (las del admin viven en admin.routes.js).
// Los comentarios nunca salen en rutas públicas: el promedio público va en owner.rating del DTO de mascota.
const router = require('express').Router();
const ctrl = require('./review.controller');
const s = require('./review.schemas');
const validate = require('../../middlewares/validate.middleware');
const { authMiddleware } = require('../../middlewares/auth.middleware');
const { reviewLimiter } = require('../../middlewares/rate-limit.middleware');

router.use(authMiddleware);
router.get('/pending', ctrl.pending);
router.get('/mine', ctrl.mine);
router.post('/', reviewLimiter, validate(s.create), ctrl.create);

module.exports = router;
