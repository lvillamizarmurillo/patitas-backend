// src/models/Pet.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Pet = sequelize.define('Pet', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  breed: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  ageMonths: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Edad en meses para estandarizar búsquedas y filtros (ej. cachorros)'
  },
  city: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    comment: '0 significa "Sin costo" o Adopción'
  },
  adoptionType: {
    type: DataTypes.ENUM('adoption', 'sale'),
    allowNull: false,
    defaultValue: 'adoption',
  },
  status: {
    type: DataTypes.ENUM('available', 'in_process', 'adopted'),
    allowNull: false,
    defaultValue: 'available',
  },
  imageUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false,
    comment: 'ID del usuario/refugio/criador que publica la mascota'
  }
}, {
  timestamps: true,
});

module.exports = Pet;