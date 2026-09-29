'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('SupportMessages', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      userId: { type: Sequelize.UUID, references: { model: 'Users', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      name: { type: Sequelize.STRING(120), allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false },
      message: { type: Sequelize.TEXT, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await qi.addIndex('SupportMessages', ['createdAt']);
  },

  async down(qi) {
    await qi.dropTable('SupportMessages');
  },
};
