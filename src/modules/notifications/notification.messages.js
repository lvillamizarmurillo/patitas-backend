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
  proposal_rejected: 'el comprador, que no aceptó el nuevo horario',
  expired: 'el sistema, porque no se confirmó antes de la fecha',
  account_suspended: 'el sistema, porque la otra cuenta fue suspendida',
};

const money = (n) => `$${Number(n).toLocaleString('es-CO')}`;
// "Pagó la comisión en línea; en la cita paga $X al vendedor" / "Pagó todo en línea"
const paymentLine = (d) => {
  if (d.paymentOption === 'full') return ` El comprador pagó todo en línea (${money(d.amountPaid)}); en la cita no paga nada más.`;
  if (d.paymentOption === 'commission') return ` El comprador reservó pagando la comisión; en la cita le paga ${money(d.payAtMeeting)} al vendedor.`;
  return '';
};

const MESSAGES = {
  'appointment.created': {
    email: true,
    render: (d) => ({
      title: 'Nueva solicitud de cita',
      message: `${d.adopterName || 'Un comprador'} quiere conocer a ${d.petName} el ${when(d.meetingDate)}${at(d)}. Confírmala, propón otro horario o cancélala.${paymentLine(d)}`,
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
    render: (d) => ({
      title: '¡Entrega completada!',
      message: d.contractDelayed
        ? `Se completó la entrega de ${d.petName}. Tu contrato está tardando más de lo normal; te avisaremos cuando esté listo.`
        : `Se completó la entrega de ${d.petName}. Ya puedes descargar tu contrato en el detalle de la cita.`,
    }),
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
  'appointment.rescheduled': {
    email: true,
    render: (d) => ({ title: 'El vendedor propone otro horario', message: `Para conocer a ${d.petName}, el vendedor propone el ${when(d.proposedMeetingDate)}${at(d)}. Acéptalo o recházalo desde tus citas.` }),
  },
  'appointment.proposal_accepted': {
    email: true,
    render: (d) => ({ title: 'Aceptaron tu horario', message: `El comprador aceptó el nuevo horario: la cita para ${d.petName} quedó confirmada para el ${when(d.meetingDate)}${at(d)}.` }),
  },
  'appointment.proposal_rejected': {
    email: true,
    render: (d) => ({ title: 'No aceptaron tu horario', message: `El comprador no aceptó el horario que propusiste para ${d.petName}, así que la cita se canceló y la mascota volvió a estar disponible.` }),
  },
  'payment.declined': {
    email: true,
    render: (d) => ({ title: 'El pago no se aprobó', message: `El pago de la reserva de ${d.petName} no se aprobó. Puedes intentarlo de nuevo con otro medio de pago.` }),
  },
  'payment.expired': {
    email: true,
    render: (d) => ({ title: 'Reserva vencida', message: `La reserva de ${d.petName} venció porque no se completó el pago a tiempo. Si todavía te interesa, vuelve a agendar.` }),
  },
  'contract.failed': {
    email: true,
    render: (d) => ({ title: 'No se pudo generar el contrato', message: `No pudimos generar el contrato de ${d.petName} después de varios intentos. El equipo ya está enterado y lo revisará.` }),
  },
  'review.requested': {
    email: true,
    render: (d) => ({ title: '¿Cómo te fue con el vendedor?', message: `Cuéntanos cómo te fue en la cita para ${d.petName}: tu calificación ayuda a otros compradores.` }),
  },
  'review.deal_closed': {
    email: false,
    render: (d) => ({ title: 'El comprador confirmó la compra', message: `El comprador dice que se concretó la compra de ${d.petName}. Marca la cita como completada para generar el contrato.` }),
  },
  'clinic.requested': {
    email: false,
    render: (d) => ({ title: 'Nueva solicitud de veterinaria', message: `${d.clinicName} (${d.city}) pidió registrarse como veterinaria de entrega.` }),
  },
  'pet.clinics_unavailable': {
    email: true,
    render: (d) => ({ title: 'Elige otra veterinaria', message: `Las veterinarias que elegiste para ${d.petName} ya no están habilitadas. Edita la publicación y elige otras para que puedan agendarte citas.` }),
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
