const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Pet = sequelize.define('Pet', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  breed: { type: DataTypes.STRING, allowNull: false },
  sex: { type: DataTypes.ENUM('male', 'female', 'unknown'), allowNull: false, defaultValue: 'unknown' },
  ageMonths: { type: DataTypes.INTEGER, allowNull: false },
  city: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.0 },
  adoptionType: { type: DataTypes.ENUM('adoption', 'sale'), allowNull: false, defaultValue: 'adoption' },
  status: { type: DataTypes.ENUM('available', 'in_process', 'adopted'), allowNull: false, defaultValue: 'available' },
  imageUrl: { type: DataTypes.STRING, allowNull: true },
  imageKey: { type: DataTypes.STRING, allowNull: true },
  ownerId: { type: DataTypes.UUID, allowNull: false },
}, { timestamps: true, paranoid: true });

module.exports = Pet;