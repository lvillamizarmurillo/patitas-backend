'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.addColumn('Users', 'suspendedAt', { type: Sequelize.DATE });
    await qi.addColumn('Users', 'suspendedBy', { type: Sequelize.UUID });
    await qi.addColumn('Users', 'suspensionReason', { type: Sequelize.STRING(500) });
    await qi.addIndex('Users', ['suspendedAt']);
  },

  async down(qi) {
    await qi.removeIndex('Users', ['suspendedAt']);
    await qi.removeColumn('Users', 'suspensionReason');
    await qi.removeColumn('Users', 'suspendedBy');
    await qi.removeColumn('Users', 'suspendedAt');
  },
};
