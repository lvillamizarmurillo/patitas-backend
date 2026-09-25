const { v2: cloudinary } = require('cloudinary');
cloudinary.config({ secure: true }); // lee CLOUDINARY_URL del entorno

exports.upload = (buffer, { folder = 'pets', resourceType = 'image' } = {}) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder: `patitas/${folder}`, resource_type: resourceType }, (err, r) =>
        err ? reject(err) : resolve({ url: r.secure_url, key: r.public_id }))
      .end(buffer);
  });

exports.remove = (key) => cloudinary.uploader.destroy(key).catch(() => {});

exports.getSignedUrl = async (publicId, { expiresInSeconds = 300 } = {}) => {
  const timestamp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return cloudinary.utils.private_download_url(publicId, 'pdf', { expires_at: timestamp, resource_type: 'raw' });
};