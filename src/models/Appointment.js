const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Appointment = sequelize.define('Appointment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  meetingDate: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'confirmed', 'completed', 'cancelled'), defaultValue: 'pending' },
  notes: { type: DataTypes.TEXT, allowNull: true },
  // Quién canceló (null = el sistema) y por qué: cancelled_by_owner | cancelled_by_adopter | expired | account_suspended
  cancelledBy: { type: DataTypes.UUID, allowNull: true },
  cancellationReason: { type: DataTypes.STRING(30), allowNull: true },
  // Marcas del job de citas para no repetir el recordatorio del día ni el aviso de cita vencida
  reminderSentAt: { type: DataTypes.DATE, allowNull: true },
  overdueNotifiedAt: { type: DataTypes.DATE, allowNull: true },
}, { timestamps: true, paranoid: true });

module.exports = Appointment;