const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PetImage = sequelize.define('PetImage', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  petId: { type: DataTypes.UUID, allowNull: false },
  url: { type: DataTypes.STRING, allowNull: false },
  key: { type: DataTypes.STRING, allowNull: true }, // null solo en imágenes migradas sin key (ej. datos del seed)
  kind: { type: DataTypes.ENUM('gallery', 'mother', 'father'), allowNull: false, defaultValue: 'gallery' },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, { timestamps: true });

module.exports = PetImage;
