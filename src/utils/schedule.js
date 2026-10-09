// Horario semanal de veterinarias y vendedores, y cálculo de horarios de cita.
// Formato: { mon: { open: "08:00", close: "18:00" }, ..., sun: null } en hora local del negocio.
const { z } = require('zod');
const { SLOT_MINUTES, MIN_LEAD_MINUTES, BOOKING_DAYS, BOOKING_SEARCH_DAYS } = require('../config/business');
const { localParts, zonedToUtc, addLocalDays, dateKey } = require('./time');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const DEFAULT_SCHEDULE = Object.freeze({
  mon: { open: '08:00', close: '18:00' },
  tue: { open: '08:00', close: '18:00' },
  wed: { open: '08:00', close: '18:00' },
  thu: { open: '08:00', close: '18:00' },
  fri: { open: '08:00', close: '18:00' },
  sat: { open: '08:00', close: '13:00' },
  sun: null,
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa el formato HH:MM (24 h)');
const daySchema = z.object({ open: hhmm, close: hhmm }).strict().nullable();

const scheduleSchema = z.object(Object.fromEntries(WEEK.map((d) => [d, daySchema.optional().default(null)]))).strict()
  .superRefine((s, ctx) => {
    const open = WEEK.filter((d) => s[d]);
    if (!open.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Abre al menos un día' });
    open.forEach((d) => {
      if (toMin(s[d].close) - toMin(s[d].open) < 60) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [d], message: 'El cierre debe ser al menos 1 hora después de la apertura' });
      }
    });
  });

// `inner` cabe dentro de `outer`: cada día abierto de inner también abre en outer y sin salirse
const fitsWithin = (inner, outer) => WEEK.every((d) => !inner[d]
  || (outer[d] && toMin(inner[d].open) >= toMin(outer[d].open) && toMin(inner[d].close) <= toMin(outer[d].close)));

// Intersección de dos horarios (null = sin restricción)
const intersect = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  return Object.fromEntries(WEEK.map((d) => {
    if (!a[d] || !b[d]) return [d, null];
    const open = Math.max(toMin(a[d].open), toMin(b[d].open));
    const close = Math.min(toMin(a[d].close), toMin(b[d].close));
    const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return [d, close > open ? { open: fmt(open), close: fmt(close) } : null];
  }));
};

// Minutos de inicio posibles en un día: cada 30 min desde la apertura hasta media hora antes del cierre
const dayStarts = (day) => {
  if (!day) return [];
  const out = [];
  for (let m = toMin(day.open); m <= toMin(day.close) - SLOT_MINUTES; m += SLOT_MINUTES) out.push(m);
  return out;
};

// ¿La fecha cae en un horario válido? (día abierto, entre apertura y media hora antes del cierre, :00 o :30)
const isWithinSchedule = (date, schedule) => {
  const p = localParts(date);
  if (p.second !== 0 || date.getUTCMilliseconds() !== 0) return false;
  const minutes = p.hour * 60 + p.minute;
  return dayStarts(schedule[p.weekday]).includes(minutes);
};

// Los primeros BOOKING_DAYS días (claves YYYY-MM-DD locales) que tienen al menos un horario libre,
// contando desde hoy y con MIN_LEAD_MINUTES de anticipación. Busca hasta BOOKING_SEARCH_DAYS adelante.
const bookableDays = (schedule, now = new Date()) => {
  const minStart = now.getTime() + MIN_LEAD_MINUTES * 60000;
  const today = localParts(now);
  const days = [];
  for (let i = 0; i < BOOKING_SEARCH_DAYS && days.length < BOOKING_DAYS; i += 1) {
    const d = addLocalDays(today, i);
    const free = dayStarts(schedule[d.weekday]).some((m) => zonedToUtc(d.year, d.month, d.day, m).getTime() >= minStart);
    if (free) days.push(dateKey(d));
  }
  return days;
};

const isInBookingWindow = (date, schedule, now = new Date()) =>
  date.getTime() >= now.getTime() + MIN_LEAD_MINUTES * 60000 && bookableDays(schedule, now).includes(dateKey(localParts(date)));

// Horarios ofrecibles: { 'YYYY-MM-DD': [Date, ...] } para los días de la ventana de agendamiento
const availableSlots = (schedule, now = new Date()) => {
  const minStart = now.getTime() + MIN_LEAD_MINUTES * 60000;
  const today = localParts(now);
  const out = {};
  for (let i = 0; i < BOOKING_SEARCH_DAYS && Object.keys(out).length < BOOKING_DAYS; i += 1) {
    const d = addLocalDays(today, i);
    const slots = dayStarts(schedule[d.weekday]).map((m) => zonedToUtc(d.year, d.month, d.day, m)).filter((t) => t.getTime() >= minStart);
    if (slots.length) out[dateKey(d)] = slots;
  }
  return out;
};

module.exports = {
  WEEK, DEFAULT_SCHEDULE, scheduleSchema, fitsWithin, intersect, isWithinSchedule, bookableDays, isInBookingWindow, availableSlots,
};
