const { Op, UniqueConstraintError } = require('sequelize');
const { sequelize, Appointment, Pet, PetClinic, User, VetClinic, Payment } = require('../../models');
const AppError = require('../../utils/AppError');
const { DEFAULT_SCHEDULE, intersect, isWithinSchedule, isInBookingWindow } = require('../../utils/schedule');
const events = require('../notifications/notification.events');
const payments = require('../payments/payment.service');

// Quién puede pasar de qué estado a cuál.
// pending_payment: solo el comprador puede abandonarla (el pago aprobado la pasa a pending vía webhook).
const TRANSITIONS = {
  pending_payment: { cancelled: ['adopter'] },
  pending: { confirmed: ['owner'], cancelled: ['owner', 'adopter'] },
  confirmed: { completed: ['owner'], cancelled: ['owner', 'adopter'] },
  completed: {},
  cancelled: {},
};

const fieldError = (field, message) => AppError.badRequest('Datos inválidos', [{ field: `body.${field}`, message }]);

// Horario efectivo para agendar en una veterinaria: el de la veterinaria ∩ el que eligió el vendedor ahí
const effectiveSchedule = (clinic, link) => intersect(clinic.schedule || DEFAULT_SCHEDULE, link?.availability || null);

// Reglas de horario (puntos 11.7 y 12): dentro del horario, en :00/:30 y en uno de los próximos días disponibles
const assertBookable = (date, schedule, field = 'meetingDate') => {
  if (!isWithinSchedule(date, schedule)) throw fieldError(field, 'La veterinaria no atiende a esa hora');
  if (!isInBookingWindow(date, schedule)) throw fieldError(field, 'Elige uno de los próximos días disponibles');
};

// Veterinaria válida para una mascota: una de las suyas (si tiene) y habilitada
const clinicForPet = async (petId, clinicId, transaction) => {
  const links = await PetClinic.findAll({ where: { petId }, transaction });
  const link = links.find((l) => l.clinicId === clinicId) || null;
  if (links.length && !link) throw fieldError('clinicId', 'Elige una de las veterinarias de esta mascota');
  const clinic = await VetClinic.findByPk(clinicId, { transaction });
  if (!clinic) throw AppError.notFound('Clínica no encontrada');
  if (clinic.status !== 'approved' || !clinic.isActive) throw fieldError('clinicId', 'Esa veterinaria ya no está disponible');
  return { clinic, link };
};

// ---------- DTO ----------

const SELLER_ATTRS = ['id', 'fullName', 'phone'];
const detailIncludes = () => [
  { model: Pet, as: 'pet', paranoid: false, include: [{ model: User, as: 'owner', attributes: SELLER_ATTRS }] },
  { model: VetClinic, as: 'clinic' },
  { model: User, as: 'adopter', attributes: ['id', 'fullName', 'email', 'phone'] },
  { model: Payment, as: 'payment' },
];

// Respuesta de una cita: los campos de siempre + propuesta, horario del vendedor, vendedor, pago y desglose
const toAppointmentDTO = (appt, link) => {
  const json = appt.toJSON();
  const pet = appt.pet;
  const option = appt.payment?.option || appt.paymentOption || null;
  return {
    ...json,
    payment: payments.toPaymentDTO(appt.payment),
    pricing: pet && pet.adoptionType === 'sale' && option ? payments.breakdown(pet.price, option) : null,
    proposal: appt.proposedMeetingDate ? { meetingDate: appt.proposedMeetingDate, proposedAt: appt.proposedAt } : null,
    availability: link?.availability ?? null,
    seller: pet?.owner ? { id: pet.owner.id, fullName: pet.owner.fullName } : null,
    clinic: appt.clinic ? { ...appt.clinic.toJSON(), schedule: appt.clinic.schedule || DEFAULT_SCHEDULE } : null,
  };
};

const linksFor = async (appts) => {
  if (!appts.length) return new Map();
  const links = await PetClinic.findAll({ where: { [Op.or]: appts.map((a) => ({ petId: a.petId, clinicId: a.clinicId })) } });
  return new Map(links.map((l) => [`${l.petId}:${l.clinicId}`, l]));
};

const loadDTO = async (id) => {
  const appt = await Appointment.findByPk(id, { include: detailIncludes() });
  const links = await linksFor([appt]);
  return toAppointmentDTO(appt, links.get(`${appt.petId}:${appt.clinicId}`));
};

// ---------- Crear ----------

exports.create = async (buyer, { petId, clinicId, meetingDate, notes, paymentOption }) => {
  let id;
  try {
    id = await sequelize.transaction(async (t) => {
      const pet = await Pet.findByPk(petId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!pet) throw AppError.notFound('Mascota no encontrada');
      if (pet.ownerId === buyer.id) throw AppError.badRequest('No puedes agendar una cita para tu propia mascota');
      if (pet.status !== 'available') throw AppError.conflict('La mascota ya no está disponible');
      const owner = await User.findByPk(pet.ownerId, { attributes: ['suspendedAt'], transaction: t });
      if (!owner || owner.suspendedAt) throw AppError.conflict('La mascota ya no está disponible');

      const { clinic, link } = await clinicForPet(pet.id, clinicId, t);
      assertBookable(meetingDate, effectiveSchedule(clinic, link));

      const isSale = pet.adoptionType === 'sale';
      if (isSale && !paymentOption) throw fieldError('paymentOption', 'Elige cómo quieres reservar: pagar la comisión o el valor completo');
      const online = isSale && payments.isOnlinePaymentEnabled();

      // Si el mismo comprador ya tenía una reserva sin pagar de esta mascota, se reemplaza (reintento de pago)
      const stale = await Appointment.findAll({ where: { petId, adopterId: buyer.id, status: 'pending_payment' }, transaction: t });
      for (const s of stale) {
        await s.update({ status: 'cancelled', cancelledBy: buyer.id, cancellationReason: 'payment_restarted' }, { transaction: t });
        await Payment.update({ status: 'expired' }, { where: { appointmentId: s.id, status: 'pending' }, transaction: t });
      }

      const appointment = await Appointment.create({
        petId, clinicId, adopterId: buyer.id, meetingDate, notes,
        paymentOption: isSale ? paymentOption : null,
        status: online ? 'pending_payment' : 'pending',
      }, { transaction: t });

      if (online) {
        // Hasta que el pago se apruebe, el vendedor no la ve y la mascota sigue publicada
        const user = await User.findByPk(buyer.id, { attributes: ['id', 'email'], transaction: t });
        await payments.createForAppointment({ appointment, pet, buyer: user, option: paymentOption }, t);
      } else {
        await pet.update({ status: 'in_process' }, { transaction: t });
        const { fullName } = await User.findByPk(buyer.id, { attributes: ['fullName'], transaction: t });
        await events.appointmentCreated({ appt: appointment, pet, adopterName: fullName }, t);
      }
      return appointment.id;
    });
  } catch (err) {
    // Índice único: otra persona tiene una reserva activa (o pagando) de esta mascota
    if (err instanceof UniqueConstraintError) {
      throw AppError.conflict('Otra persona está reservando esta mascota. Intenta de nuevo en unos minutos.');
    }
    throw err;
  }
  return loadDTO(id);
};

// ---------- Cambiar estado ----------

exports.updateStatus = async (user, id, newStatus) => {
  await sequelize.transaction(async (t) => {
    const appt = await Appointment.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!appt) throw AppError.notFound('Cita no encontrada');
    const pet = await Pet.findByPk(appt.petId, { transaction: t, lock: t.LOCK.UPDATE, paranoid: false });

    let actor = appt.adopterId === user.id ? 'adopter' : null;
    if (!actor && pet.ownerId === user.id && appt.status !== 'pending_payment') actor = 'owner';
    if (!actor) throw AppError.notFound('Cita no encontrada');

    const allowed = TRANSITIONS[appt.status][newStatus];
    if (!allowed) throw AppError.conflict(`No se puede pasar de "${appt.status}" a "${newStatus}"`);
    if (!allowed.includes(actor)) throw AppError.forbidden('No puedes realizar esta acción');
    if (newStatus === 'confirmed' && appt.proposedMeetingDate) {
      throw AppError.conflict('Propusiste otro horario: espera la respuesta del comprador');
    }

    const extra = newStatus === 'cancelled'
      ? { cancelledBy: user.id, cancellationReason: actor === 'owner' ? 'cancelled_by_owner' : 'cancelled_by_adopter', proposedMeetingDate: null, proposedAt: null }
      : {};
    const wasPendingPayment = appt.status === 'pending_payment';
    await appt.update({ status: newStatus, ...extra }, { transaction: t });

    if (newStatus === 'cancelled') {
      if (!wasPendingPayment) await pet.update({ status: 'available' }, { transaction: t });
      await payments.flagRefundIfPaid(appt.id, `Cancelada por el ${actor === 'owner' ? 'vendedor' : 'comprador'}`, t);
    }
    if (newStatus === 'completed') {
      await pet.update({ status: 'adopted' }, { transaction: t });
      await payments.createPayoutIfNeeded(appt, pet, t);
      t.afterCommit(() => require('../../queue/contract-queue').enqueueContractGeneration(appt.id));
    }
    if (!wasPendingPayment) await events.appointmentStatusChanged({ appt, pet, status: newStatus, actor }, t);
  });
  return loadDTO(id);
};

// ---------- Otro horario (punto 14) ----------

const lockForProposal = async (user, id, role, t) => {
  const appt = await Appointment.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!appt) throw AppError.notFound('Cita no encontrada');
  const pet = await Pet.findByPk(appt.petId, { transaction: t, paranoid: false });
  const isOwner = pet.ownerId === user.id && appt.status !== 'pending_payment';
  const isBuyer = appt.adopterId === user.id;
  if (!isOwner && !isBuyer) throw AppError.notFound('Cita no encontrada');
  if ((role === 'owner' && !isOwner) || (role === 'adopter' && !isBuyer)) throw AppError.forbidden('No puedes realizar esta acción');
  if (appt.status !== 'pending') throw AppError.conflict('La cita ya no está por confirmar');
  return { appt, pet };
};

exports.propose = async (user, id, { meetingDate }) => {
  await sequelize.transaction(async (t) => {
    const { appt, pet } = await lockForProposal(user, id, 'owner', t);
    const clinic = await VetClinic.findByPk(appt.clinicId, { transaction: t });
    const link = await PetClinic.findOne({ where: { petId: pet.id, clinicId: clinic.id }, transaction: t });
    if (meetingDate.getTime() === new Date(appt.meetingDate).getTime()) {
      throw fieldError('meetingDate', 'Propón un horario distinto al que pidió el comprador');
    }
    assertBookable(meetingDate, effectiveSchedule(clinic, link));
    await appt.update({ proposedMeetingDate: meetingDate, proposedAt: new Date() }, { transaction: t });
    await events.appointmentProposal({ appt, pet, kind: 'proposed' }, t);
  });
  return loadDTO(id);
};

exports.acceptProposal = async (user, id) => {
  await sequelize.transaction(async (t) => {
    const { appt, pet } = await lockForProposal(user, id, 'adopter', t);
    if (!appt.proposedMeetingDate) throw AppError.conflict('No hay un horario propuesto');
    if (new Date(appt.proposedMeetingDate).getTime() <= Date.now()) throw AppError.conflict('El horario propuesto ya pasó');
    await appt.update({
      meetingDate: appt.proposedMeetingDate, proposedMeetingDate: null, proposedAt: null, status: 'confirmed', reminderSentAt: null,
    }, { transaction: t });
    await events.appointmentProposal({ appt, pet, kind: 'accepted' }, t);
  });
  return loadDTO(id);
};

exports.rejectProposal = async (user, id) => {
  await sequelize.transaction(async (t) => {
    const { appt, pet } = await lockForProposal(user, id, 'adopter', t);
    if (!appt.proposedMeetingDate) throw AppError.conflict('No hay un horario propuesto');
    await appt.update({
      status: 'cancelled', cancelledBy: user.id, cancellationReason: 'proposal_rejected', proposedMeetingDate: null, proposedAt: null,
    }, { transaction: t });
    await pet.update({ status: 'available' }, { transaction: t });
    await payments.flagRefundIfPaid(appt.id, 'El comprador rechazó el horario propuesto', t);
    await events.appointmentProposal({ appt, pet, kind: 'rejected' }, t);
  });
  return loadDTO(id);
};

// ---------- Consultar ----------

// Citas donde el usuario participa como comprador O como dueño de la mascota, sea cual sea su rol.
// Al vendedor no le llegan las que esperan pago.
exports.list = async (user, { status, page, limit }) => {
  const where = {
    ...(status ? { status } : {}),
    [Op.or]: [
      { adopterId: user.id },
      { '$pet.ownerId$': user.id, status: { [Op.ne]: 'pending_payment' } },
    ],
  };
  if (status) where[Op.or][1].status = status === 'pending_payment' ? null : status;

  const { rows, count } = await Appointment.findAndCountAll({
    where, distinct: true, subQuery: false, limit, offset: (page - 1) * limit, order: [['meetingDate', 'DESC']],
    include: [
      {
        model: Pet, as: 'pet', attributes: ['id', 'name', 'imageUrl', 'ownerId', 'price', 'adoptionType'], required: true, paranoid: false,
        include: [{ model: User, as: 'owner', attributes: SELLER_ATTRS }],
      },
      { model: VetClinic, as: 'clinic', attributes: ['id', 'name', 'address', 'city', 'phone', 'schedule'] },
      { model: User, as: 'adopter', attributes: ['id', 'fullName', 'email', 'phone'] },
      { model: Payment, as: 'payment' },
    ],
  });
  const links = await linksFor(rows);
  return { items: rows.map((a) => toAppointmentDTO(a, links.get(`${a.petId}:${a.clinicId}`))), meta: { page, limit, total: count } };
};

exports.getById = async (user, id) => {
  const appt = await Appointment.findByPk(id, { include: detailIncludes() });
  if (!appt) throw AppError.notFound('Cita no encontrada');
  const isOwner = appt.pet.ownerId === user.id && appt.status !== 'pending_payment';
  const isAdopter = appt.adopterId === user.id;
  if (!isOwner && !isAdopter) throw AppError.notFound('Cita no encontrada');
  const links = await linksFor([appt]);
  return toAppointmentDTO(appt, links.get(`${appt.petId}:${appt.clinicId}`));
};
