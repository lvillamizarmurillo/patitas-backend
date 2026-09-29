const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const NewsletterSubscriber = sequelize.define('NewsletterSubscriber', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
  subscribedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  unsubscribedAt: { type: DataTypes.DATE, allowNull: true },
}, { timestamps: true });

module.exports = NewsletterSubscriber;
