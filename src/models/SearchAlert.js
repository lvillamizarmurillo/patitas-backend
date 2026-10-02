const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Filtros guardados por un comprador. El job de alertas le avisa por correo cuando se publican mascotas que coinciden.
const SearchAlert = sequelize.define('SearchAlert', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  breed: { type: DataTypes.STRING(80), allowNull: true },
  city: { type: DataTypes.STRING(80), allowNull: true },
  minPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  maxPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  adoptionType: { type: DataTypes.ENUM('adoption', 'sale'), allowNull: true },
  // Cursor: solo se notifican mascotas publicadas después de esta fecha
  lastCheckedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  lastNotifiedAt: { type: DataTypes.DATE, allowNull: true },
}, { timestamps: true });

module.exports = SearchAlert;
