const { fn, col, Op } = require('sequelize');
const { Pet, Appointment, User } = require('../../models');

exports.getOwnerDashboard = async (ownerId) => {
  const ownPet = (attributes = []) => ({ model: Pet, as: 'pet', where: { ownerId }, attributes, required: true });

  const [byStatus, pending, upcoming, history] = await Promise.all([
    Pet.findAll({ where: { ownerId }, attributes: ['status', [fn('COUNT', col('id')), 'total']], group: ['status'], raw: true }),
    Appointment.count({ where: { status: 'pending' }, include: [ownPet()] }),
    Appointment.findAll({
      where: { status: 'confirmed', meetingDate: { [Op.gte]: new Date() } },
      include: [ownPet(['id', 'name', 'imageUrl']), { model: User, as: 'adopter', attributes: ['fullName'] }],
      order: [['meetingDate', 'ASC']], limit: 5,
    }),
    Appointment.findAll({
      where: { status: 'completed' },
      include: [ownPet(['id', 'name', 'breed', 'imageUrl']), { model: User, as: 'adopter', attributes: ['fullName'] }],
      order: [['updatedAt', 'DESC']], limit: 10,
    }),
  ]);

  const pets = { available: 0, in_process: 0, adopted: 0 };
  byStatus.forEach((r) => { pets[r.status] = Number(r.total); });

  return { pets: { ...pets, total: pets.available + pets.in_process + pets.adopted }, appointments: { pending, upcoming }, history };
};