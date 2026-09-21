const { Sequelize } = require('sequelize');
const env = require('./env');
const logger = require('./logger');

module.exports = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
  host: env.DB_HOST,
  port: env.DB_PORT,
  dialect: 'postgres',
  logging: env.NODE_ENV === 'development' ? (sql) => logger.debug(sql) : false,
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
  // En RDS usa el bundle de CA de AWS en vez de rejectUnauthorized:false
  dialectOptions: env.DB_SSL ? { ssl: { require: true, rejectUnauthorized: false } } : {},
});