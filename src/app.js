const crypto = require('crypto');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const env = require('./config/env');
const logger = require('./config/logger');
const { sequelize } = require('./models');
const routes = require('./routes');
const { globalLimiter } = require('./middlewares/rate-limit.middleware');
const notFound = require('./middlewares/not-found.middleware');
const errorHandler = require('./middlewares/error.middleware');

const app = express();
app.set('trust proxy', env.TRUST_PROXY); // Dokploy (Traefik), Railway y Render van detrás de un proxy
app.disable('x-powered-by');

const allowedOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);

app.use(pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
  autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' }, // el healthcheck corre cada 30s
}));
app.use(helmet({
  // API JSON pura: nada debe cargarse ni embeberse desde aquí
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: false },
}));
app.use(cors({
  origin: allowedOrigins,
  credentials: true, // necesario para que la cookie httpOnly del refresh token viaje
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));
app.use(compression());
app.use(cookieParser());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await sequelize.authenticate();
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

app.use(globalLimiter);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

if (env.STORAGE_DRIVER === 'local') {
  app.use('/uploads',
    helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }),
    express.static(path.join(__dirname, '../public/uploads'), { index: false }));
}

// Ninguna respuesta de la API (tokens, datos personales) debe quedar en cachés intermedias
app.use('/api/v1', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;