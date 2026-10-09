const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Quién hizo qué en el panel admin (verificar, suspender, roles, veterinarias, soporte, pagos…)
const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  actorId: { type: DataTypes.UUID },
  action: { type: DataTypes.STRING(60), allowNull: false },
  targetType: { type: DataTypes.STRING(40) },
  targetId: { type: DataTypes.UUID },
  details: { type: DataTypes.JSONB },
}, { timestamps: true, updatedAt: false });

module.exports = AuditLog;
