require('dotenv').config();
const { z } = require('zod');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default('info'),

  // Si Railway/Render inyectan DATABASE_URL, se usa esa; si no, las variables sueltas de abajo
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_NAME: z.string().optional(),
  DB_SSL: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('15m'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'), // base de los links que van en los correos

  STORAGE_DRIVER: z.enum(['local', 'cloudinary', 's3']).default('local'),
  CLOUDINARY_URL: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  CDN_DOMAIN: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('no-reply@patitas.app'),
  SUPPORT_EMAIL: z.string().email().optional(), // destino de "Escríbenos"; vacío = solo se guarda en BD

  CONTRACT_QUEUE_URL: z.string().optional(), // vacío hoy: el PDF se genera inline
}).refine(
  (d) => d.DATABASE_URL || (d.DB_HOST && d.DB_USER && d.DB_PASSWORD && d.DB_NAME),
  { message: 'Define DATABASE_URL o DB_HOST/DB_USER/DB_PASSWORD/DB_NAME' },
);

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:');
  parsed.error.issues.forEach((i) => console.error(` - ${i.path.join('.')}: ${i.message}`));
  process.exit(1);
}
module.exports = parsed.data;