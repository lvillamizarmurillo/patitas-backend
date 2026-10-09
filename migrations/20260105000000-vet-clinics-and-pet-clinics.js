'use strict';

const DEFAULT_SCHEDULE = {
  mon: { open: '08:00', close: '18:00' },
  tue: { open: '08:00', close: '18:00' },
  wed: { open: '08:00', close: '18:00' },
  thu: { open: '08:00', close: '18:00' },
  fri: { open: '08:00', close: '18:00' },
  sat: { open: '08:00', close: '13:00' },
  sun: null,
};

module.exports = {
  async up(qi, Sequelize) {
    await qi.addColumn('VetClinics', 'schedule', { type: Sequelize.JSONB });
    await qi.addColumn('VetClinics', 'status', {
      type: Sequelize.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'approved',
    });
    await qi.addColumn('VetClinics', 'contactName', { type: Sequelize.STRING(120) });
    await qi.addColumn('VetClinics', 'contactEmail', { type: Sequelize.STRING });
    await qi.addColumn('VetClinics', 'rejectionReason', { type: Sequelize.TEXT });
    await qi.addColumn('VetClinics', 'reviewedBy', { type: Sequelize.UUID, references: { model: 'Users', key: 'id' }, onDelete: 'SET NULL' });
    await qi.addColumn('VetClinics', 'reviewedAt', { type: Sequelize.DATE });
    // Las veterinarias que ya existían quedan aprobadas con el horario por defecto
    await qi.sequelize.query('UPDATE "VetClinics" SET schedule = :schedule::jsonb WHERE schedule IS NULL',
      { replacements: { schedule: JSON.stringify(DEFAULT_SCHEDULE) } });
    await qi.addIndex('VetClinics', ['status', 'isActive', 'city']);

    // Veterinarias de entrega de cada mascota, con el horario que el vendedor puede atender en cada una
    await qi.createTable('PetClinics', {
      petId: { type: Sequelize.UUID, allowNull: false, primaryKey: true, references: { model: 'Pets', key: 'id' }, onDelete: 'CASCADE' },
      clinicId: { type: Sequelize.UUID, allowNull: false, primaryKey: true, references: { model: 'VetClinics', key: 'id' }, onDelete: 'CASCADE' },
      availability: { type: Sequelize.JSONB },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await qi.addIndex('PetClinics', ['clinicId']);
  },

  async down(qi) {
    await qi.dropTable('PetClinics');
    await qi.removeIndex('VetClinics', ['status', 'isActive', 'city']);
    for (const col of ['reviewedAt', 'reviewedBy', 'rejectionReason', 'contactEmail', 'contactName', 'status', 'schedule']) {
      await qi.removeColumn('VetClinics', col);
    }
    await qi.sequelize.query('DROP TYPE IF EXISTS "enum_VetClinics_status"');
  },
};
