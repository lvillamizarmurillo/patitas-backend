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
const SearchAlert = require('./SearchAlert');
const Notification = require('./Notification');
const PetClinic = require('./PetClinic');
const Payment = require('./Payment');
const Payout = require('./Payout');
const Review = require('./Review');
const SupportReply = require('./SupportReply');
const StaffRole = require('./StaffRole');
const AuditLog = require('./AuditLog');

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

User.hasMany(SearchAlert, { foreignKey: 'userId', as: 'searchAlerts' });
SearchAlert.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Veterinarias de entrega de cada mascota (con el horario del vendedor en cada una)
Pet.belongsToMany(VetClinic, { through: PetClinic, foreignKey: 'petId', otherKey: 'clinicId', as: 'clinics' });
VetClinic.belongsToMany(Pet, { through: PetClinic, foreignKey: 'clinicId', otherKey: 'petId', as: 'pets' });
Pet.hasMany(PetClinic, { foreignKey: 'petId', as: 'petClinics' });

// Pagos y desembolsos
Appointment.hasOne(Payment, { foreignKey: 'appointmentId', as: 'payment' });
Payment.belongsTo(Appointment, { foreignKey: 'appointmentId', as: 'appointment' });
Payment.belongsTo(User, { foreignKey: 'buyerId', as: 'buyer' });
Payment.hasOne(Payout, { foreignKey: 'paymentId', as: 'payout' });
Payout.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });
Payout.belongsTo(User, { foreignKey: 'sellerId', as: 'seller' });
Payout.belongsTo(Appointment, { foreignKey: 'appointmentId', as: 'appointment' });

// Calificaciones
Appointment.hasOne(Review, { foreignKey: 'appointmentId', as: 'review' });
Review.belongsTo(Appointment, { foreignKey: 'appointmentId', as: 'appointment' });
Review.belongsTo(User, { foreignKey: 'buyerId', as: 'buyer' });
Review.belongsTo(User, { foreignKey: 'sellerId', as: 'seller' });
Review.belongsTo(Pet, { foreignKey: 'petId', as: 'pet' });

// Soporte
SupportMessage.hasMany(SupportReply, { foreignKey: 'messageId', as: 'replies' });
SupportReply.belongsTo(SupportMessage, { foreignKey: 'messageId', as: 'supportMessage' });

// Equipo y auditoría
StaffRole.hasMany(User, { foreignKey: 'staffRoleId', as: 'members' });
User.belongsTo(StaffRole, { foreignKey: 'staffRoleId', as: 'staffRole' });
AuditLog.belongsTo(User, { foreignKey: 'actorId', as: 'actor' });

module.exports = {
  sequelize, User, Pet, PetImage, VetClinic, Appointment, Contract, Favorite,
  RefreshToken, PasswordResetToken, NewsletterSubscriber, SupportMessage, SearchAlert, Notification,
  PetClinic, Payment, Payout, Review, SupportReply, StaffRole, AuditLog,
};
