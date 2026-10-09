const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Respuesta del equipo a un mensaje de soporte (se envía por correo a quien escribió)
const SupportReply = sequelize.define('SupportReply', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  messageId: { type: DataTypes.UUID, allowNull: false },
  authorId: { type: DataTypes.UUID },
  message: { type: DataTypes.TEXT, allowNull: false },
  emailSent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { timestamps: true, updatedAt: false });

module.exports = SupportReply;
