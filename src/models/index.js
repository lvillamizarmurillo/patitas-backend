const sequelize = require('../config/database');
const User = require('./User');
const Pet = require('./Pet');
const PetImage = require('./PetImage');
const VetClinic = require('./VetClinic');
const Appointment = require('./Appointment');
const Contract = require('./Contract');
const Favorite = require('./Favorite');
const RefreshToken = require('./RefreshToken');
const PasswordResetToken = require('./PasswordResetToken');
const NewsletterSubscriber = require('./NewsletterSubscriber');
const SupportMessage = require('./SupportMessage');

User.hasMany(Pet, { foreignKey: 'ownerId', as: 'pets' });
Pet.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

Pet.hasMany(PetImage, { foreignKey: 'petId', as: 'images', onDelete: 'CASCADE' });
PetImage.belongsTo(Pet, { foreignKey: 'petId', as: 'pet' });

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

User.hasMany(PasswordResetToken, { foreignKey: 'userId', as: 'passwordResetTokens' });
PasswordResetToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(SupportMessage, { foreignKey: 'userId', as: 'supportMessages' });
SupportMessage.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = {
  sequelize, User, Pet, PetImage, VetClinic, Appointment, Contract, Favorite,
  RefreshToken, PasswordResetToken, NewsletterSubscriber, SupportMessage,
};
