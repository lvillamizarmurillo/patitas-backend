const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Favorite = sequelize.define('Favorite', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  petId: { type: DataTypes.UUID, allowNull: false },
}, {
  timestamps: true,
  indexes: [{ unique: true, fields: ['userId', 'petId'] }],
});

module.exports = Favorite;