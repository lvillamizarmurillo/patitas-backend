const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SupportMessage = sequelize.define('SupportMessage', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: true }, // null si el visitante no inició sesión
  name: { type: DataTypes.STRING(120), allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, validate: { isEmail: true } },
  message: { type: DataTypes.TEXT, allowNull: false },
}, { timestamps: true });

module.exports = SupportMessage;
