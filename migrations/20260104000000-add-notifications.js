'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('Notifications', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      userId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      type: { type: Sequelize.STRING(50), allowNull: false },
      data: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      readAt: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    // Listado del usuario (más recientes primero) y conteo de no leídas
    await qi.addIndex('Notifications', ['userId', 'createdAt']);
    await qi.sequelize.query('CREATE INDEX notifications_unread_idx ON "Notifications" ("userId") WHERE "readAt" IS NULL');

    // Quién canceló la cita y por qué; marcas para que el job no repita recordatorios/avisos
    await qi.addColumn('Appointments', 'cancelledBy', {
      type: Sequelize.UUID, references: { model: 'Users', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE',
    });
    await qi.addColumn('Appointments', 'cancellationReason', { type: Sequelize.STRING(30) });
    await qi.addColumn('Appointments', 'reminderSentAt', { type: Sequelize.DATE });
    await qi.addColumn('Appointments', 'overdueNotifiedAt', { type: Sequelize.DATE });
    await qi.addIndex('Appointments', ['status', 'meetingDate']);
  },

  async down(qi) {
    await qi.removeIndex('Appointments', ['status', 'meetingDate']);
    await qi.removeColumn('Appointments', 'overdueNotifiedAt');
    await qi.removeColumn('Appointments', 'reminderSentAt');
    await qi.removeColumn('Appointments', 'cancellationReason');
    await qi.removeColumn('Appointments', 'cancelledBy');
    await qi.dropTable('Notifications');
  },
};
