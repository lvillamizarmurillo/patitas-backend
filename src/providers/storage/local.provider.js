const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const dir = path.join(__dirname, '../../../public/uploads');

exports.upload = async (buffer, { ext = 'webp' } = {}) => {
  await fs.mkdir(dir, { recursive: true });
  const key = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(dir, key), buffer);
  return { url: `/uploads/${key}`, key };
};

exports.remove = (key) => fs.unlink(path.join(dir, key)).catch(() => {});
exports.getSignedUrl = async (key) => `/uploads/${key}`;