'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('PasswordResetTokens', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      userId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      tokenHash: { type: Sequelize.STRING(64), allowNull: false },
      expiresAt: { type: Sequelize.DATE, allowNull: false },
      usedAt: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await qi.addIndex('PasswordResetTokens', ['tokenHash'], { unique: true });
    await qi.addIndex('PasswordResetTokens', ['userId']);
  },

  async down(qi) {
    await qi.dropTable('PasswordResetTokens');
  },
};
