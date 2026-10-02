const env = require('../../config/env');

// Textos de cada tipo de notificación. Se generan al leer (no se guardan), así un cambio de redacción
// aplica también a las notificaciones viejas. `email: true` = también se envía por correo si hay SMTP.
const when = (iso) => (iso
  ? new Date(iso).toLocaleString('es-CO', { timeZone: env.APP_TIMEZONE, dateStyle: 'full', timeStyle: 'short' })
  : '');
const at = (d) => (d.clinicName ? ` en ${d.clinicName}` : '');

const CANCEL_BY = {
  cancelled_by_owner: 'el vendedor',
  cancelled_by_adopter: 'el comprador',
  expired: 'el sistema, porque no se confirmó antes de la fecha',
  account_suspended: 'el sistema, porque la otra cuenta fue suspendida',
};

const MESSAGES = {
  'appointment.created': {
    email: true,
    render: (d) => ({
      title: 'Nueva solicitud de cita',
      message: `${d.adopterName || 'Un comprador'} quiere conocer a ${d.petName} el ${when(d.meetingDate)}${at(d)}. Confírmala o cancélala.`,
    }),
  },
  'appointment.confirmed': {
    email: true,
    render: (d) => ({ title: 'Cita confirmada', message: `Tu cita para conocer a ${d.petName} quedó confirmada para el ${when(d.meetingDate)}${at(d)}.` }),
  },
  'appointment.cancelled': {
    email: true,
    render: (d) => ({
      title: 'Cita cancelada',
      message: `La cita para ${d.petName} del ${when(d.meetingDate)} fue cancelada por ${CANCEL_BY[d.cancellationReason] || 'la otra parte'}.`,
    }),
  },
  'appointment.completed': {
    email: true,
    render: (d) => ({ title: '¡Entrega completada!', message: `Se completó la entrega de ${d.petName}. Tu contrato estará disponible en el detalle de la cita.` }),
  },
  'appointment.reminder': {
    email: true,
    render: (d) => ({ title: 'Hoy es tu cita', message: `Recuerda: hoy a las ${new Date(d.meetingDate).toLocaleTimeString('es-CO', { timeZone: env.APP_TIMEZONE, timeStyle: 'short' })} es la cita para ${d.petName}${at(d)}.` }),
  },
  'appointment.expired': {
    email: true,
    render: (d) => ({ title: 'Cita vencida', message: `La cita para ${d.petName} del ${when(d.meetingDate)} no se confirmó a tiempo y se canceló automáticamente.` }),
  },
  'appointment.overdue': {
    email: true,
    render: (d) => ({ title: '¿Cómo te fue en la cita?', message: `La cita para ${d.petName} del ${when(d.meetingDate)} ya pasó. Márcala como completada o cancélala.` }),
  },
  'organization.verified': {
    email: true,
    render: () => ({ title: 'Cuenta verificada', message: `Tu cuenta ya está verificada en ${env.APP_NAME}: tus publicaciones muestran la insignia de vendedor verificado.` }),
  },
  'organization.revoked': {
    email: true,
    render: () => ({ title: 'Verificación retirada', message: 'Se retiró la verificación de tu cuenta. Escríbenos si crees que es un error.' }),
  },
  'favorite.in_process': {
    email: false,
    render: (d) => ({ title: 'Una de tus favoritas tiene cita', message: `${d.petName}, que tienes en favoritos, tiene una cita agendada. Si se cancela, volverá a estar disponible.` }),
  },
  'favorite.adopted': {
    email: false,
    render: (d) => ({ title: 'Una de tus favoritas encontró hogar', message: `${d.petName}, que tenías en favoritos, ya fue entregada a su nueva familia.` }),
  },
};

exports.TYPES = Object.keys(MESSAGES);
exports.wantsEmail = (type) => Boolean(MESSAGES[type]?.email);
exports.render = (type, data = {}) => (MESSAGES[type] ? MESSAGES[type].render(data) : { title: 'Notificación', message: '' });
