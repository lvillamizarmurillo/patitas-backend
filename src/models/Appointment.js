const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Appointment = sequelize.define('Appointment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  meetingDate: { type: DataTypes.DATE, allowNull: false },
  // pending_payment: espera el pago en línea; el vendedor todavía no la ve
  status: { type: DataTypes.ENUM('pending_payment', 'pending', 'confirmed', 'completed', 'cancelled'), defaultValue: 'pending' },
  notes: { type: DataTypes.TEXT, allowNull: true },
  // Quién canceló (null = el sistema) y por qué:
  // cancelled_by_owner | cancelled_by_adopter | proposal_rejected | expired | payment_expired | account_suspended
  cancelledBy: { type: DataTypes.UUID, allowNull: true },
  cancellationReason: { type: DataTypes.STRING(30), allowNull: true },
  // Marcas del job de citas para no repetir el recordatorio del día ni el aviso de cita vencida
  reminderSentAt: { type: DataTypes.DATE, allowNull: true },
  overdueNotifiedAt: { type: DataTypes.DATE, allowNull: true },
  // Otro horario propuesto por el vendedor, pendiente de respuesta del comprador
  proposedMeetingDate: { type: DataTypes.DATE, allowNull: true },
  proposedAt: { type: DataTypes.DATE, allowNull: true },
  // Reintentos de la generación del contrato PDF
  contractAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  contractFailedNotifiedAt: { type: DataTypes.DATE, allowNull: true },
  // Aviso de que la encuesta de satisfacción ya está disponible
  reviewRequestedAt: { type: DataTypes.DATE, allowNull: true },
  // Opción de reserva de una venta: commission (paga la comisión en línea) | full (paga todo en línea)
  paymentOption: { type: DataTypes.STRING(20), allowNull: true },
}, { timestamps: true, paranoid: true });

module.exports = Appointment;