const env = require('../../config/env');
const drivers = {
  local: () => require('./local.provider'),
  cloudinary: () => require('./cloudinary.provider'),
  s3: () => require('./s3.provider'),
};
module.exports = drivers[env.STORAGE_DRIVER]();