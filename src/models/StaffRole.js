const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Rol del equipo creado por el admin: un nombre y una lista de permisos del catálogo (config/permissions.js)
const StaffRole = sequelize.define('StaffRole', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(60), allowNull: false },
  description: { type: DataTypes.STRING(300) },
  permissions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
}, { timestamps: true });

module.exports = StaffRole;
