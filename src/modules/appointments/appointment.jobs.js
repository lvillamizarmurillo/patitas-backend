const { Op } = require('sequelize');
const env = require('../../config/env');
const { sequelize, Appointment, Pet } = require('../../models');
const events = require('../notifications/notification.events');

const LOCK_KEY = 74202; // pg advisory lock: si hay varias réplicas, solo una procesa a la vez
const HOUR = 3600000;

// Fecha/hora "de pared" en la zona horaria del negocio (por defecto America/Bogota)
const localParts = (date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: env.APP_TIMEZONE, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
};

// Instante UTC en que termina el día local de `now`
const endOfLocalDay = (now) => {
  const p = localParts(now);
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 23, 59, 59, 999) - offset);
};
exports.endOfLocalDay = endOfLocalDay;

// Recordatorio del día del encuentro a ambas partes, para citas confirmadas.
// Desde APPOINTMENT_REMINDER_FROM_HOUR (7 a. m.) cubre todas las del día; antes de esa hora solo las de las próximas
// 3 h, para no mandar correos de madrugada.
const sendReminders = async (now, t) => {
  const endOfDay = endOfLocalDay(now);
  const early = localParts(now).hour < env.APPOINTMENT_REMINDER_FROM_HOUR;
  const until = early ? new Date(Math.min(endOfDay.getTime(), now.getTime() + 3 * HOUR)) : endOfDay;

  const appts = await Appointment.findAll({
    where: { status: 'confirmed', reminderSentAt: null, meetingDate: { [Op.gt]: now, [Op.lte]: until } },
    include: [{ model: Pet, as: 'pet', attributes: ['id', 'name', 'ownerId'], required: true }],
    transaction: t, lock: { level: t.LOCK.UPDATE, of: Appointment }, skipLocked: true,
  });
  for (const appt of appts) {
    const data = { appointmentId: appt.id, petId: appt.pet.id, petName: appt.pet.name, meetingDate: appt.meetingDate };
    await events.notify([
      { userId: appt.adopterId, type: 'appointment.reminder', data },
      { userId: appt.pet.ownerId, type: 'appointment.reminder', data },
    ], t);
    await appt.update({ reminderSentAt: now }, { transaction: t });
  }
  return appts.length;
};

// Pendientes cuya fecha ya pasó sin que el vendedor confirmara: se cancelan y la mascota vuelve a estar disponible
const expirePending = async (now, t) => {
  const appts = await Appointment.findAll({
    where: { status: 'pending', meetingDate: { [Op.lte]: now } },
    include: [{ model: Pet, as: 'pet', attributes: ['id', 'name', 'ownerId'], required: true }],
    transaction: t, lock: { level: t.LOCK.UPDATE, of: Appointment }, skipLocked: true,
  });
  for (const appt of appts) {
    await appt.update({ status: 'cancelled', cancelledBy: null, cancellationReason: 'expired' }, { transaction: t });
    await Pet.update({ status: 'available' }, { where: { id: appt.petId, status: 'in_process' }, transaction: t });
    const data = { appointmentId: appt.id, petId: appt.pet.id, petName: appt.pet.name, meetingDate: appt.meetingDate };
    await events.notify([
      { userId: appt.adopterId, type: 'appointment.expired', data },
      { userId: appt.pet.ownerId, type: 'appointment.expired', data },
    ], t);
  }
  return appts.length;
};

// Confirmadas que pasaron hace más de APPOINTMENT_OVERDUE_HOURS sin cerrarse: un aviso (una sola vez) al vendedor
const flagOverdue = async (now, t) => {
  const appts = await Appointment.findAll({
    where: {
      status: 'confirmed', overdueNotifiedAt: null,
      meetingDate: { [Op.lte]: new Date(now.getTime() - env.APPOINTMENT_OVERDUE_HOURS * HOUR) },
    },
    include: [{ model: Pet, as: 'pet', attributes: ['id', 'name', 'ownerId'], required: true }],
    transaction: t, lock: { level: t.LOCK.UPDATE, of: Appointment }, skipLocked: true,
  });
  for (const appt of appts) {
    const data = { appointmentId: appt.id, petId: appt.pet.id, petName: appt.pet.name, meetingDate: appt.meetingDate };
    await events.notify([{ userId: appt.pet.ownerId, type: 'appointment.overdue', data }], t);
    await appt.update({ overdueNotifiedAt: now }, { transaction: t });
  }
  return appts.length;
};

exports.runAppointmentJobs = (now = new Date()) =>
  sequelize.transaction(async (t) => {
    const [[{ locked }]] = await sequelize.query('SELECT pg_try_advisory_xact_lock(:key) AS locked',
      { replacements: { key: LOCK_KEY }, transaction: t });
    if (!locked) return { skipped: 'otra-instancia-procesando' };
    return {
      recordatorios: await sendReminders(now, t),
      vencidas: await expirePending(now, t),
      sinCerrar: await flagOverdue(now, t),
    };
  });
