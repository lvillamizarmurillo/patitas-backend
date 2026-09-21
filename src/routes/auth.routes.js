const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

router.post('/register', authController.register);
router.post('/login', authController.login);

// Ruta de prueba para verificar que el token funciona
router.get('/me', authMiddleware, (req, res) => {
  res.json({ message: 'Acceso autorizado a ruta protegida', user: req.user });
});

module.exports = router;