const express = require('express');
const router = express.Router();
const petController = require('../controllers/pet.controller');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload.middleware');

// GET /api/pets - Obtener todas las mascotas disponibles (con filtros query)
router.get('/', petController.getPets);

// GET /api/pets/:id - Ver detalle de una mascota
router.get('/:id', petController.getPetById);

// POST /api/pets - Publicar una mascota
// Solo autenticados pueden publicar, 'image' es el nombre del campo en form-data
router.post(
  '/', 
  authMiddleware, 
  roleMiddleware(['shelter', 'breeder', 'individual']), // El adoptante puro no publica
  upload.single('image'), 
  petController.createPet
);

module.exports = router;