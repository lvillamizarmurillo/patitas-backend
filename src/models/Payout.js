const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Desembolso pendiente al vendedor: se crea cuando se completa una cita pagada con la opción `full`
const Payout = sequelize.define('Payout', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  paymentId: { type: DataTypes.UUID, allowNull: false },
  appointmentId: { type: DataTypes.UUID, allowNull: false },
  sellerId: { type: DataTypes.UUID, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'paid'), allowNull: false, defaultValue: 'pending' },
  paidAt: { type: DataTypes.DATE },
  paidBy: { type: DataTypes.UUID },
  transferReference: { type: DataTypes.STRING(120) },
}, { timestamps: true });

module.exports = Payout;
