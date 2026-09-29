const multer = require('multer');
const sharp = require('sharp');
const AppError = require('../utils/AppError');

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

exports.MAX_GALLERY = 3;
exports.MAX_PET_IMAGES = 5; // 3 de la mascota + madre + padre

exports.upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: exports.MAX_PET_IMAGES, fields: 12, fieldSize: 10 * 1024 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.includes(file.mimetype) ? cb(null, true) : cb(AppError.badRequest('Solo se permiten imágenes JPG, PNG o WEBP')),
});

// Campos de imagen de una publicación: galería de la mascota + una foto de cada padre
exports.petImages = exports.upload.fields([
  { name: 'gallery', maxCount: exports.MAX_GALLERY },
  { name: 'motherPhoto', maxCount: 1 },
  { name: 'fatherPhoto', maxCount: 1 },
]);

const toWebp = async (file) => {
  const img = sharp(file.buffer, { limitInputPixels: 40_000_000 });
  const { format } = await img.metadata();
  if (!['jpeg', 'png', 'webp'].includes(format)) throw new Error('formato');
  file.buffer = await img.rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  file.mimetype = 'image/webp';
};

// Normaliza a WebP todo lo que haya llegado, sea `req.file` (single) o `req.files` (fields/array)
exports.processImage = async (req, _res, next) => {
  const files = [
    ...(req.file ? [req.file] : []),
    ...(Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat()),
  ];
  if (!files.length) return next();
  try {
    await Promise.all(files.map(toWebp));
    next();
  } catch {
    next(AppError.badRequest('Una de las imágenes es inválida o está corrupta'));
  }
};
