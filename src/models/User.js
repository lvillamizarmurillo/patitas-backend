const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  role: {
    type: DataTypes.ENUM('adopter', 'shelter', 'breeder', 'individual', 'admin', 'staff'),
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
  // Suspensión por admin: no puede iniciar sesión y sus publicaciones se ocultan
  suspendedAt: { type: DataTypes.DATE },
  suspendedBy: { type: DataTypes.UUID },
  suspensionReason: { type: DataTypes.STRING(500) },
  // Equipo: rol con permisos del panel admin y el rol que tenía antes de entrar al equipo
  staffRoleId: { type: DataTypes.UUID },
  previousRole: { type: DataTypes.STRING(20) },
  // Calificación pública del vendedor (cache, se recalcula al calificar u ocultar)
  ratingAverage: { type: DataTypes.DECIMAL(3, 2) },
  ratingCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // Datos para transferirle al vendedor (sensibles: fuera del defaultScope)
  payoutInfo: { type: DataTypes.JSONB },
}, {
  timestamps: true,
  paranoid: true,
  defaultScope: { attributes: { exclude: ['password', 'payoutInfo'] } },
  scopes: { withPassword: {}, withPayoutInfo: { attributes: { exclude: ['password'] } } },
  hooks: {
    beforeCreate: async (user) => { if (user.password) user.password = await bcrypt.hash(user.password, 12); },
    beforeUpdate: async (user) => { if (user.changed('password')) user.password = await bcrypt.hash(user.password, 12); },
  },
});

module.exports = User;