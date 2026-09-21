const Pet = require('../models/Pet');
const VetClinic = require('../models/VetClinic');

exports.getFilters = async (req, res, next) => {
  try {
    const breeds = await Pet.findAll({
      attributes: ['breed'],
      group: ['breed'],
      where: { status: 'available' }
    });

    const petCities = await Pet.findAll({
      attributes: ['city'],
      group: ['city']
    });

    res.json({
      breeds: breeds.map(b => b.breed),
      cities: petCities.map(c => c.city)
    });
  } catch (error) {
    next(error);
  }
};

exports.getClinics = async (req, res, next) => {
  try {
    const { city } = req.query;
    const where = city ? { city, isActive: true } : { isActive: true };
    const clinics = await VetClinic.findAll({ where });
    res.json({ clinics });
  } catch (error) {
    next(error);
  }
};