const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Encuesta de satisfacción: una por cita. El comentario solo lo ven el vendedor calificado y el admin.
const Review = sequelize.define('Review', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appointmentId: { type: DataTypes.UUID, allowNull: false, unique: true },
  buyerId: { type: DataTypes.UUID, allowNull: false },
  sellerId: { type: DataTypes.UUID, allowNull: false },
  petId: { type: DataTypes.UUID, allowNull: false },
  dealClosed: { type: DataTypes.BOOLEAN, allowNull: false },
  rating: { type: DataTypes.SMALLINT, allowNull: false, validate: { min: 1, max: 5 } },
  comment: { type: DataTypes.STRING(500) },
  hiddenAt: { type: DataTypes.DATE },
  hiddenBy: { type: DataTypes.UUID },
}, { timestamps: true });

module.exports = Review;
