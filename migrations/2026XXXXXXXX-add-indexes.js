module.exports = {
  async up(qi) {
    await qi.addIndex('Pets', ['ownerId']);
    await qi.addIndex('Pets', ['status', 'city']);
    await qi.addIndex('Appointments', ['adopterId']);
    await qi.addIndex('Appointments', ['petId']);
    await qi.addIndex('Appointments', ['clinicId']);
    await qi.sequelize.query(`
      CREATE UNIQUE INDEX uniq_active_appt_per_pet ON "Appointments" ("petId")
      WHERE status IN ('pending','confirmed')`);
  },
  async down(qi) {
    await qi.sequelize.query('DROP INDEX IF EXISTS uniq_active_appt_per_pet');
    await qi.removeIndex('Appointments', ['clinicId']);
    await qi.removeIndex('Appointments', ['petId']);
    await qi.removeIndex('Appointments', ['adopterId']);
    await qi.removeIndex('Pets', ['status', 'city']);
    await qi.removeIndex('Pets', ['ownerId']);
  },
};