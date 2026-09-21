const multer = require('multer');
const sharp = require('sharp');
const AppError = require('../utils/AppError');

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

exports.upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10, fieldSize: 10 * 1024 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.includes(file.mimetype) ? cb(null, true) : cb(AppError.badRequest('Solo se permiten imágenes JPG, PNG o WEBP')),
});

exports.processImage = async (req, _res, next) => {
  if (!req.file) return next();
  try {
    const img = sharp(req.file.buffer, { limitInputPixels: 40_000_000 });
    const { format } = await img.metadata();
    if (!['jpeg', 'png', 'webp'].includes(format)) throw new Error('formato');
    req.file.buffer = await img
      .rotate() // aplica la orientación EXIF antes de que se elimine
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer(); // sharp no conserva metadatos por defecto
    req.file.mimetype = 'image/webp';
    next();
  } catch {
    next(AppError.badRequest('La imagen es inválida o está corrupta'));
  }
};