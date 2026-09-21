const router = require('express').Router();
const ctrl = require('./pet.controller');
const s = require('./pet.schemas');
const validate = require('../../middlewares/validate.middleware');
const { authMiddleware, requireRole } = require('../../middlewares/auth.middleware');
const { upload, processImage } = require('../../middlewares/upload.middleware');
const { uploadLimiter } = require('../../middlewares/rate-limit.middleware');

router.get('/', validate(s.list), ctrl.list);
router.get('/:id', validate(s.byId), ctrl.getById);
router.post('/',
  authMiddleware,
  requireRole('shelter', 'breeder', 'individual'), // antes de parsear el archivo: no gastas recursos
  uploadLimiter,
  upload.single('image'),
  processImage,
  validate(s.create), // después de multer, porque es él quien llena req.body
  ctrl.create);

module.exports = router;