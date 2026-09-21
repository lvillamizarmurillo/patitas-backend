const { v2: cloudinary } = require('cloudinary');
cloudinary.config({ secure: true }); // lee CLOUDINARY_URL del entorno

exports.upload = (buffer, { folder = 'pets' } = {}) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder: `patitas/${folder}`, resource_type: 'image' }, (err, r) =>
        err ? reject(err) : resolve({ url: r.secure_url, key: r.public_id }))
      .end(buffer);
  });

exports.remove = (key) => cloudinary.uploader.destroy(key);