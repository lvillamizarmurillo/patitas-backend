const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Pago en línea de una cita de venta.
// option = commission → el comprador paga solo la comisión; full → paga precio del vendedor + comisión.
const Payment = sequelize.define('Payment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appointmentId: { type: DataTypes.UUID, allowNull: false },
  buyerId: { type: DataTypes.UUID, allowNull: false },
  option: { type: DataTypes.ENUM('commission', 'full'), allowNull: false },
  sellerPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  commission: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'COP' },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'declined', 'voided', 'error', 'expired', 'refunded'),
    allowNull: false, defaultValue: 'pending',
  },
  provider: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'wompi' },
  reference: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  providerTransactionId: { type: DataTypes.STRING(64) },
  checkoutUrl: { type: DataTypes.TEXT },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  approvedAt: { type: DataTypes.DATE },
  // La política de devoluciones está pendiente de producto: se marca `required` y el admin la gestiona a mano
  refundStatus: { type: DataTypes.STRING(20) },
  refundNote: { type: DataTypes.TEXT },
  lastEvent: { type: DataTypes.JSONB },
}, { timestamps: true });

module.exports = Payment;
