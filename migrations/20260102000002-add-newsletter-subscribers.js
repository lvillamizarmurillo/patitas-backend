'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('NewsletterSubscribers', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      subscribedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      unsubscribedAt: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },

  async down(qi) {
    await qi.dropTable('NewsletterSubscribers');
  },
};
