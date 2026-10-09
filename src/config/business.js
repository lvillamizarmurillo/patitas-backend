// Reglas de negocio configurables en un solo lugar (los valores ajustables vienen de env.js)
const env = require('./env');

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const normalizeCity = (s = '') => stripAccents(String(s)).trim().toLowerCase().replace(/\s+/g, ' ');

// Ciudades donde operan las veterinarias de entrega (CLINIC_CITIES, separadas por coma)
const ALLOWED_CITIES = env.CLINIC_CITIES.split(',').map((c) => c.trim()).filter(Boolean);

module.exports = {
  normalizeCity,
  ALLOWED_CITIES,
  // Nombre canónico de una ciudad permitida (sin importar tildes ni mayúsculas) o null
  canonicalCity: (city) => ALLOWED_CITIES.find((c) => normalizeCity(c) === normalizeCity(city)) || null,
  sameCity: (a, b) => normalizeCity(a) === normalizeCity(b),

  // Comisión: el vendedor recibe `price`; el comprador ve price + comisión (redondeo al peso)
  COMMISSION_RATE: env.COMMISSION_RATE,
  commissionOf: (price) => Math.round(Number(price) * env.COMMISSION_RATE),
  publicPriceOf: (price) => Number(price) + Math.round(Number(price) * env.COMMISSION_RATE),

  // Agendamiento
  BOOKING_DAYS: env.BOOKING_DAYS, // días con horarios que se ofrecen
  BOOKING_SEARCH_DAYS: env.BOOKING_SEARCH_DAYS, // hasta cuántos días adelante se busca
  SLOT_MINUTES: 30,
  MIN_LEAD_MINUTES: 60, // anticipación mínima de una cita

  PAYMENT_EXPIRY_MINUTES: env.PAYMENT_EXPIRY_MINUTES,
  REVIEW_DELAY_DAYS: 3,
  MAX_CLINICS_PER_PET: 10,
};
