const sequelize = require('../config/database');
const User = require('./User');
const Pet = require('./Pet');
const VetClinic = require('./VetClinic');
const Appointment = require('./Appointment');
const Contract = require('./Contract');
const Favorite = require('./Favorite');
const RefreshToken = require('./RefreshToken');

User.hasMany(Pet, { foreignKey: 'ownerId', as: 'pets' });
Pet.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

User.hasMany(Appointment, { foreignKey: 'adopterId', as: 'appointments' });
Appointment.belongsTo(User, { foreignKey: 'adopterId', as: 'adopter' });

Pet.hasMany(Appointment, { foreignKey: 'petId', as: 'appointments' });
Appointment.belongsTo(Pet, { foreignKey: 'petId', as: 'pet' });

VetClinic.hasMany(Appointment, { foreignKey: 'clinicId', as: 'appointments' });
Appointment.belongsTo(VetClinic, { foreignKey: 'clinicId', as: 'clinic' });

Appointment.hasOne(Contract, { foreignKey: 'appointmentId', as: 'contract' });
Contract.belongsTo(Appointment, { foreignKey: 'appointmentId', as: 'appointment' });

User.hasMany(Favorite, { foreignKey: 'userId', as: 'favorites' });
Favorite.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Pet.hasMany(Favorite, { foreignKey: 'petId', as: 'favoritedBy' });
Favorite.belongsTo(Pet, { foreignKey: 'petId', as: 'pet' });

User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
RefreshToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = { sequelize, User, Pet, VetClinic, Appointment, Contract, Favorite, RefreshToken };