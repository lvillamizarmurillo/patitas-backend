const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SupportMessage = sequelize.define('SupportMessage', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: true }, // null si el visitante no inició sesión
  name: { type: DataTypes.STRING(120), allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, validate: { isEmail: true } },
  message: { type: DataTypes.TEXT, allowNull: false },
  // Quién escribe y sobre qué (los envía el formulario de contacto)
  audience: { type: DataTypes.STRING(20) }, // comprador | criadero | particular | veterinaria | otro
  topic: { type: DataTypes.STRING(20) }, // cita | publicacion | pagos | cuenta | verificacion | veterinarias | otro
  phone: { type: DataTypes.STRING(30) },
  status: { type: DataTypes.ENUM('open', 'resolved'), allowNull: false, defaultValue: 'open' },
  note: { type: DataTypes.TEXT }, // nota interna del equipo
  resolvedAt: { type: DataTypes.DATE },
  resolvedBy: { type: DataTypes.UUID },
}, { timestamps: true });

module.exports = SupportMessage;
