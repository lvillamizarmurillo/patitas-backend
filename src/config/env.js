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
  // Saltos de proxy confiables para leer la IP real (rate limit). Dokploy/Traefik = 1; Cloudflare + Traefik = 2
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  // 'strict' sirve si front y API comparten dominio (app.midominio.com + api.midominio.com).
  // Solo usa 'none' si están en dominios distintos (exige HTTPS).
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),
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
  MAIL_FROM: z.string().email().default('no-reply@patitas.app'),
  APP_NAME: z.string().trim().min(1).max(60).default('PuppyMarket'), // nombre que firma los correos
  SUPPORT_EMAIL: z.string().email().optional(), // destino de "Escríbenos"; vacío = solo se guarda en BD

  CONTRACT_QUEUE_URL: z.string().optional(), // vacío hoy: el PDF se genera inline

  // Alertas de búsqueda: cada cuánto revisa el job (0 = apagado) y mínimo de horas entre correos por alerta
  SEARCH_ALERTS_INTERVAL_MINUTES: z.coerce.number().int().min(0).max(1440).default(60),
  SEARCH_ALERTS_COOLDOWN_HOURS: z.coerce.number().int().min(1).max(168).default(24),

  // Job de citas: recordatorio del día del encuentro, vencimiento de pendientes y aviso de confirmadas sin cerrar
  APP_TIMEZONE: z.string().default('America/Bogota')
    .refine((tz) => { try { new Intl.DateTimeFormat('es-CO', { timeZone: tz }); return true; } catch { return false; } }, 'Zona horaria inválida'),
  APPOINTMENT_JOBS_INTERVAL_MINUTES: z.coerce.number().int().min(0).max(1440).default(15),
  APPOINTMENT_REMINDER_FROM_HOUR: z.coerce.number().int().min(0).max(23).default(7),
  APPOINTMENT_OVERDUE_HOURS: z.coerce.number().int().min(1).max(720).default(24),

  // Veterinarias de entrega: ciudades donde se opera (separadas por coma)
  CLINIC_CITIES: z.string().default('Bucaramanga,Floridablanca,Piedecuesta'),
  // Agendamiento: días con horarios que se ofrecen y hasta cuántos días adelante se buscan
  BOOKING_DAYS: z.coerce.number().int().min(1).max(14).default(3),
  BOOKING_SEARCH_DAYS: z.coerce.number().int().min(1).max(60).default(21),

  // Comisión que se suma al precio del vendedor (0.17 = 17 %)
  COMMISSION_RATE: z.coerce.number().min(0).max(1).default(0.17),
  // Pagos (Wompi). Sin WOMPI_PUBLIC_KEY el pago en línea queda deshabilitado y la cita se crea sin checkoutUrl.
  WOMPI_PUBLIC_KEY: z.string().optional(),
  WOMPI_INTEGRITY_SECRET: z.string().optional(),
  WOMPI_EVENTS_SECRET: z.string().optional(),
  PAYMENT_EXPIRY_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
}).superRefine((d, ctx) => {
  const fail = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  if (!d.DATABASE_URL && !(d.DB_HOST && d.DB_USER && d.DB_PASSWORD && d.DB_NAME)) {
    fail('DATABASE_URL', 'Define DATABASE_URL o DB_HOST/DB_USER/DB_PASSWORD/DB_NAME');
  }
  if (d.STORAGE_DRIVER === 'cloudinary' && !d.CLOUDINARY_URL) fail('CLOUDINARY_URL', 'Requerida con STORAGE_DRIVER=cloudinary');
  if (d.STORAGE_DRIVER === 's3' && !d.S3_BUCKET) fail('S3_BUCKET', 'Requerida con STORAGE_DRIVER=s3');
  if (d.WOMPI_PUBLIC_KEY && !(d.WOMPI_INTEGRITY_SECRET && d.WOMPI_EVENTS_SECRET)) {
    fail('WOMPI_INTEGRITY_SECRET', 'Con WOMPI_PUBLIC_KEY también se requieren WOMPI_INTEGRITY_SECRET y WOMPI_EVENTS_SECRET');
  }

  if (d.NODE_ENV === 'production') {
    const origins = d.CORS_ORIGINS.split(',').map((o) => o.trim());
    if (origins.some((o) => o === '*' || !o.startsWith('https://'))) {
      fail('CORS_ORIGINS', 'En producción solo se permiten orígenes https:// explícitos (sin *)');
    }
    if (!d.FRONTEND_URL.startsWith('https://')) fail('FRONTEND_URL', 'En producción debe ser https://');
    if (d.STORAGE_DRIVER === 'local') {
      fail('STORAGE_DRIVER', 'local pierde las imágenes en cada deploy; usa cloudinary o s3 en producción');
    }
    if (/cambia|change|example|secret|patitas/i.test(d.JWT_SECRET) || new Set(d.JWT_SECRET).size < 10) {
      fail('JWT_SECRET', 'Parece un valor de ejemplo; genera uno aleatorio (openssl rand -hex 48)');
    }
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:');
  parsed.error.issues.forEach((i) => console.error(` - ${i.path.join('.')}: ${i.message}`));
  process.exit(1);
}
module.exports = parsed.data;