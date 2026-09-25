const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  role: {
    type: DataTypes.ENUM('adopter', 'shelter', 'breeder', 'individual', 'admin'),
    allowNull: false, defaultValue: 'adopter',
  },
  fullName: { type: DataTypes.STRING, allowNull: false },
  city: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
  phone: { type: DataTypes.STRING, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  termsAccepted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  termsAcceptedAt: { type: DataTypes.DATE },
  termsVersion: { type: DataTypes.STRING(20) },
  isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
  verifiedAt: { type: DataTypes.DATE },
  verifiedBy: { type: DataTypes.UUID },
}, {
  timestamps: true,
  paranoid: true,
  defaultScope: { attributes: { exclude: ['password'] } },
  scopes: { withPassword: {} },
  hooks: {
    beforeCreate: async (user) => { if (user.password) user.password = await bcrypt.hash(user.password, 12); },
    beforeUpdate: async (user) => { if (user.changed('password')) user.password = await bcrypt.hash(user.password, 12); },
  },
});

module.exports = User;