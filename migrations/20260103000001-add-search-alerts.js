'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('SearchAlerts', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      userId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      breed: { type: Sequelize.STRING(80) },
      city: { type: Sequelize.STRING(80) },
      minPrice: { type: Sequelize.DECIMAL(12, 2) },
      maxPrice: { type: Sequelize.DECIMAL(12, 2) },
      adoptionType: { type: Sequelize.ENUM('adoption', 'sale') },
      lastCheckedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      lastNotifiedAt: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await qi.addIndex('SearchAlerts', ['userId']);
  },

  async down(qi) {
    await qi.dropTable('SearchAlerts');
    await qi.sequelize.query('DROP TYPE IF EXISTS "enum_SearchAlerts_adoptionType"');
  },
};
