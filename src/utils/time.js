const env = require('../config/env');

// Utilidades de fecha en la zona horaria del negocio (APP_TIMEZONE, por defecto America/Bogota).

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Fecha/hora "de pared" en la zona del negocio: { year, month, day, hour, minute, second, weekday }
const localParts = (date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: env.APP_TIMEZONE, hourCycle: 'h23', weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const out = {};
  parts.forEach((p) => {
    if (p.type === 'weekday') out.weekday = p.value.slice(0, 3).toLowerCase();
    else if (p.type !== 'literal') out[p.type] = Number(p.value);
  });
  return out;
};

// Diferencia (ms) entre la hora local y UTC en ese instante
const offsetMs = (date) => {
  const p = localParts(date);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
};

// Instante UTC de una fecha/hora local (year, month 1-12, day, minutos desde medianoche)
const zonedToUtc = (year, month, day, minutes = 0) => {
  const guess = Date.UTC(year, month - 1, day, 0, minutes);
  const first = guess - offsetMs(new Date(guess));
  return new Date(guess - offsetMs(new Date(first))); // segunda pasada por si cae en un cambio de horario
};

// Instante UTC en que termina el día local de `now`
const endOfLocalDay = (now) => {
  const p = localParts(now);
  return new Date(zonedToUtc(p.year, p.month, p.day, 24 * 60).getTime() - 1);
};

// Día local siguiente/anterior (sin depender de la hora)
const addLocalDays = ({ year, month, day }, n) => {
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: DAY_KEYS[d.getUTCDay()] };
};

const dateKey = ({ year, month, day }) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

module.exports = { DAY_KEYS, localParts, zonedToUtc, endOfLocalDay, addLocalDays, dateKey };
