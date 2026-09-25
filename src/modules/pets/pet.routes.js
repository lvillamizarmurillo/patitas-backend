const router = require('express').Router();
const ctrl = require('./pet.controller');
const s = require('./pet.schemas');
const validate = require('../../middlewares/validate.middleware');
const { authMiddleware, requireRole } = require('../../middlewares/auth.middleware');
const { upload, processImage } = require('../../middlewares/upload.middleware');
const { uploadLimiter } = require('../../middlewares/rate-limit.middleware');

// /mine va ANTES de /:id, si no Express intenta leer "mine" como UUID
router.get('/mine', authMiddleware, validate(s.mine), ctrl.listMine);
router.get('/', validate(s.list), ctrl.list);
router.get('/:id', validate(s.byId), ctrl.getById);

router.post('/',
  authMiddleware,
  requireRole('shelter', 'breeder', 'individual'),
  uploadLimiter,
  upload.single('image'),
  processImage,
  validate(s.create),
  ctrl.create);

router.patch('/:id',
  authMiddleware,
  uploadLimiter,
  upload.single('image'),
  processImage,
  validate(s.update),
  ctrl.update);

router.delete('/:id', authMiddleware, validate(s.byId), ctrl.remove);

module.exports = router;