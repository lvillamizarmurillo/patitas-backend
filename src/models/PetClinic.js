const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Veterinarias de entrega que el vendedor marcó para una mascota,
// con el horario que él puede atender ahí (mismo formato que VetClinic.schedule; null = todo el horario de la veterinaria)
const PetClinic = sequelize.define('PetClinic', {
  petId: { type: DataTypes.UUID, primaryKey: true },
  clinicId: { type: DataTypes.UUID, primaryKey: true },
  availability: { type: DataTypes.JSONB, allowNull: true },
}, { timestamps: true });

module.exports = PetClinic;
