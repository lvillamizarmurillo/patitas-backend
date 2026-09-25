const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Contract = sequelize.define('Contract', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appointmentId: { type: DataTypes.UUID, allowNull: false, unique: true },
  contractNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  pdfKey: { type: DataTypes.STRING, allowNull: false },
  sha256: { type: DataTypes.STRING, allowNull: false },
  templateVersion: { type: DataTypes.STRING, defaultValue: '1.0' },
}, { timestamps: true, paranoid: true });

module.exports = Contract;