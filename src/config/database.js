const { Sequelize } = require('sequelize');
const env = require('./env');
const logger = require('./logger');

const logging = env.NODE_ENV === 'development' ? (sql) => logger.debug(sql) : false;
const pool = { max: 10, min: 0, acquire: 30000, idle: 10000 };
const dialectOptions = env.DB_SSL ? { ssl: { require: true, rejectUnauthorized: false } } : {};

module.exports = env.DATABASE_URL
  ? new Sequelize(env.DATABASE_URL, { dialect: 'postgres', logging, pool, dialectOptions })
  : new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
      host: env.DB_HOST, port: env.DB_PORT, dialect: 'postgres', logging, pool, dialectOptions,
    });