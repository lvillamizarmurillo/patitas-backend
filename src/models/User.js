// src/models/User.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  role: {
    type: DataTypes.ENUM('adopter', 'shelter', 'breeder', 'individual'),
    allowNull: false,
    defaultValue: 'adopter',
    comment: 'Rol según el tipo de cuenta elegido en el registro',
  },
  fullName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  city: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  termsAccepted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Nuevos campos: prueba de consentimiento (Ley 1581 de 2012, habeas data)
  termsAcceptedAt: { 
    type: DataTypes.DATE 
  },
  termsVersion: { 
    type: DataTypes.STRING(20) 
  },
  // Campo sugerido en el análisis para verificación de refugios/criadores
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  }
}, {
  timestamps: true,
  paranoid: true, // Habilita el "soft delete" (borrado lógico) recomendado
  
  // Seguridad: Nunca devuelve la contraseña por defecto en consultas (find, findAll)
  defaultScope: { 
    attributes: { exclude: ['password'] } 
  },
  // Scope especial usado únicamente en el login
  scopes: { 
    withPassword: {} 
  },
  
  hooks: {
    // Incremento del factor de costo a 12 para mayor seguridad
    beforeCreate: async (user) => { 
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 12); 
      }
    },
    beforeUpdate: async (user) => { 
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 12); 
      }
    }
  }
});

module.exports = User;