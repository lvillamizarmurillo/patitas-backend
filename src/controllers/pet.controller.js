const Pet = require('../models/Pet');
const User = require('../models/User');
const { Op } = require('sequelize');

exports.createPet = async (req, res, next) => {
  try {
    const { name, breed, ageMonths, city, price, adoptionType } = req.body;
    const ownerId = req.user.id; // Viene del authMiddleware

    // Ruta de la imagen guardada localmente
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const newPet = await Pet.create({
      name,
      breed,
      ageMonths,
      city,
      price: price || 0,
      adoptionType,
      imageUrl,
      ownerId
    });

    res.status(201).json({ message: 'Mascota publicada exitosamente', pet: newPet });
  } catch (error) {
    next(error);
  }
};

exports.getPets = async (req, res, next) => {
  try {
    const { city, breed, filter } = req.query;
    let whereClause = { status: 'available' };

    if (city) whereClause.city = { [Op.iLike]: `%${city}%` };
    if (breed) whereClause.breed = { [Op.iLike]: `%${breed}%` };

    // Filtros visuales del mockup
    if (filter === 'adopcion') {
      whereClause.adoptionType = 'adoption';
    } else if (filter === 'cachorros') {
      whereClause.ageMonths = { [Op.lte]: 12 }; // Menor o igual a 12 meses
    }

    let includeClause = [{
      model: User,
      as: 'owner',
      attributes: ['id', 'fullName', 'role']
    }];

    // Filtro "Con criador" requiere filtrar por el rol del owner
    if (filter === 'criador') {
      includeClause[0].where = { role: 'breeder' };
    }

    const pets = await Pet.findAll({
      where: whereClause,
      include: includeClause,
      order: [['createdAt', 'DESC']]
    });

    res.json({ pets });
  } catch (error) {
    next(error);
  }
};

exports.getPetById = async (req, res, next) => {
  try {
    const pet = await Pet.findByPk(req.params.id, {
      include: [{ model: User, as: 'owner', attributes: ['fullName', 'role', 'city'] }]
    });

    if (!pet) return res.status(404).json({ message: 'Mascota no encontrada' });
    res.json({ pet });
  } catch (error) {
    next(error);
  }
};