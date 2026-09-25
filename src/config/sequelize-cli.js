require('dotenv').config();

const base = {
  dialect: 'postgres',
  dialectOptions: process.env.DB_SSL === 'true' ? { ssl: { require: true, rejectUnauthorized: false } } : {},
};

const config = process.env.DATABASE_URL
  ? { ...base, use_env_variable: 'DATABASE_URL' }
  : {
      ...base,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
    };

module.exports = { development: config, test: config, production: config };