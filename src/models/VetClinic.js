const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const VetClinic = sequelize.define('VetClinic', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  address: { type: DataTypes.STRING, allowNull: false },
  city: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING },
  openingHours: { type: DataTypes.STRING }, // en desuso: reemplazado por `schedule`
  // Horario semanal: { mon: { open, close } | null, ... } en hora local (ver utils/schedule.js)
  schedule: { type: DataTypes.JSONB },
  // pending = solicitud por revisar; approved = aprobada; rejected = rechazada
  status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'approved' },
  // isActive = habilitada por el admin (solo aplica a las aprobadas)
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  contactName: { type: DataTypes.STRING(120) },
  contactEmail: { type: DataTypes.STRING },
  rejectionReason: { type: DataTypes.TEXT },
  reviewedBy: { type: DataTypes.UUID },
  reviewedAt: { type: DataTypes.DATE },
}, { timestamps: true });

module.exports = VetClinic;