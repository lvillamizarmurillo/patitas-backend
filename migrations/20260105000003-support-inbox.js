'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.addColumn('SupportMessages', 'audience', { type: Sequelize.STRING(20) });
    await qi.addColumn('SupportMessages', 'topic', { type: Sequelize.STRING(20) });
    await qi.addColumn('SupportMessages', 'phone', { type: Sequelize.STRING(30) });
    await qi.addColumn('SupportMessages', 'status', { type: Sequelize.ENUM('open', 'resolved'), allowNull: false, defaultValue: 'open' });
    await qi.addColumn('SupportMessages', 'note', { type: Sequelize.TEXT });
    await qi.addColumn('SupportMessages', 'resolvedAt', { type: Sequelize.DATE });
    await qi.addColumn('SupportMessages', 'resolvedBy', { type: Sequelize.UUID });
    await qi.addIndex('SupportMessages', ['status', 'audience']);

    await qi.createTable('SupportReplies', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      messageId: { type: Sequelize.UUID, allowNull: false, references: { model: 'SupportMessages', key: 'id' }, onDelete: 'CASCADE' },
      authorId: { type: Sequelize.UUID, references: { model: 'Users', key: 'id' }, onDelete: 'SET NULL' },
      message: { type: Sequelize.TEXT, allowNull: false },
      emailSent: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await qi.addIndex('SupportReplies', ['messageId', 'createdAt']);
  },

  async down(qi) {
    await qi.dropTable('SupportReplies');
    await qi.removeIndex('SupportMessages', ['status', 'audience']);
    for (const col of ['resolvedBy', 'resolvedAt', 'note', 'status', 'phone', 'topic', 'audience']) {
      await qi.removeColumn('SupportMessages', col);
    }
    await qi.sequelize.query('DROP TYPE IF EXISTS "enum_SupportMessages_status"');
  },
};
