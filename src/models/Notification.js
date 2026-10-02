const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Notificación in-app. `type` define el texto (ver notifications/notification.messages.js)
// y `data` guarda el contexto: appointmentId, petId, petName, meetingDate, etc.
const Notification = sequelize.define('Notification', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  type: { type: DataTypes.STRING(50), allowNull: false },
  data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  readAt: { type: DataTypes.DATE, allowNull: true },
}, { timestamps: true, updatedAt: false });

module.exports = Notification;
