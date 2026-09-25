const { sequelize, Appointment, Pet, User, VetClinic } = require('../../models');
const AppError = require('../../utils/AppError');

const TRANSITIONS = {
  pending:   { confirmed: ['owner'],  cancelled: ['owner', 'adopter'] },
  confirmed: { completed: ['owner'],  cancelled: ['owner', 'adopter'] },
  completed: {},
  cancelled: {},
};

exports.create = (adopter, { petId, clinicId, meetingDate, notes }) =>
  sequelize.transaction(async (t) => {
    const pet = await Pet.findByPk(petId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!pet) throw AppError.notFound('Mascota no encontrada');
    if (pet.ownerId === adopter.id) throw AppError.badRequest('No puedes agendar una cita para tu propia mascota');
    if (pet.status !== 'available') throw AppError.conflict('La mascota ya no está disponible');

    const clinic = await VetClinic.findOne({ where: { id: clinicId, isActive: true }, transaction: t });
    if (!clinic) throw AppError.notFound('Clínica no encontrada');

    const appointment = await Appointment.create(
      { petId, clinicId, adopterId: adopter.id, meetingDate, notes }, { transaction: t });
    await pet.update({ status: 'in_process' }, { transaction: t });
    return appointment;
  });

exports.updateStatus = (user, id, newStatus) =>
  sequelize.transaction(async (t) => {
    const appt = await Appointment.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!appt) throw AppError.notFound('Cita no encontrada');
    const pet = await Pet.findByPk(appt.petId, { transaction: t, lock: t.LOCK.UPDATE });

    const actor = pet.ownerId === user.id ? 'owner' : appt.adopterId === user.id ? 'adopter' : null;
    if (!actor) throw AppError.notFound('Cita no encontrada');

    const allowed = TRANSITIONS[appt.status][newStatus];
    if (!allowed) throw AppError.conflict(`No se puede pasar de "${appt.status}" a "${newStatus}"`);
    if (!allowed.includes(actor)) throw AppError.forbidden('No puedes realizar esta acción');

    await appt.update({ status: newStatus }, { transaction: t });
    if (newStatus === 'cancelled') await pet.update({ status: 'available' }, { transaction: t });
    if (newStatus === 'completed') {
      await pet.update({ status: 'adopted' }, { transaction: t });
      t.afterCommit(() => require('../../queue/contract-queue').enqueueContractGeneration(appt.id));
    }
    return appt;
  });

exports.list = async (user, { status, page, limit }) => {
  const where = status ? { status } : {};
  const petInclude = { model: Pet, as: 'pet', attributes: ['id', 'name', 'imageUrl', 'ownerId'], required: true };
  if (user.role === 'adopter') where.adopterId = user.id;
  else petInclude.where = { ownerId: user.id };

  const { rows, count } = await Appointment.findAndCountAll({
    where, distinct: true, limit, offset: (page - 1) * limit, order: [['meetingDate', 'DESC']],
    include: [
      petInclude,
      { model: VetClinic, as: 'clinic', attributes: ['id', 'name', 'address', 'city', 'phone'] },
      { model: User, as: 'adopter', attributes: ['id', 'fullName', 'email', 'phone'] },
    ],
  });
  return { items: rows, meta: { page, limit, total: count } };
};

exports.getById = async (user, id) => {
  const appt = await Appointment.findByPk(id, {
    include: [
      { model: Pet, as: 'pet', include: [{ model: User, as: 'owner', attributes: ['id', 'fullName', 'phone'] }] },
      { model: VetClinic, as: 'clinic' },
      { model: User, as: 'adopter', attributes: ['id', 'fullName', 'email', 'phone'] },
    ],
  });
  if (!appt) throw AppError.notFound('Cita no encontrada');
  const isOwner = appt.pet.ownerId === user.id;
  const isAdopter = appt.adopterId === user.id;
  if (!isOwner && !isAdopter) throw AppError.notFound('Cita no encontrada');
  return appt;
};