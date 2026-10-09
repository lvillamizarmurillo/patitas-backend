'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('Reviews', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      appointmentId: { type: Sequelize.UUID, allowNull: false, unique: true, references: { model: 'Appointments', key: 'id' }, onDelete: 'CASCADE' },
      buyerId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE' },
      sellerId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE' },
      petId: { type: Sequelize.UUID, allowNull: false },
      dealClosed: { type: Sequelize.BOOLEAN, allowNull: false },
      rating: { type: Sequelize.SMALLINT, allowNull: false },
      comment: { type: Sequelize.STRING(500) },
      hiddenAt: { type: Sequelize.DATE }, // el admin puede ocultar una calificación abusiva
      hiddenBy: { type: Sequelize.UUID },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await qi.sequelize.query('ALTER TABLE "Reviews" ADD CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5)');
    await qi.addIndex('Reviews', ['sellerId', 'createdAt']);

    // Promedio público cacheado en el vendedor (se recalcula al calificar u ocultar)
    await qi.addColumn('Users', 'ratingAverage', { type: Sequelize.DECIMAL(3, 2) });
    await qi.addColumn('Users', 'ratingCount', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
  },

  async down(qi) {
    await qi.removeColumn('Users', 'ratingCount');
    await qi.removeColumn('Users', 'ratingAverage');
    await qi.dropTable('Reviews');
  },
};
