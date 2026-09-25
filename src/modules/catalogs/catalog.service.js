const { Pet, VetClinic } = require('../../models');

exports.getFilters = async () => {
  const breeds = await Pet.findAll({ attributes: ['breed'], group: ['breed'], where: { status: 'available' }, raw: true });
  const cities = await Pet.findAll({ attributes: ['city'], group: ['city'], raw: true });
  return { breeds: breeds.map((b) => b.breed), cities: cities.map((c) => c.city) };
};

exports.getClinics = async (city) => {
  const where = { isActive: true, ...(city ? { city } : {}) };
  return VetClinic.findAll({ where, order: [['name', 'ASC']] });
};