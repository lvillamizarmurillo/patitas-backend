'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('PetImages', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      petId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Pets', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      url: { type: Sequelize.STRING, allowNull: false },
      key: { type: Sequelize.STRING },
      kind: { type: Sequelize.ENUM('gallery', 'mother', 'father'), allowNull: false, defaultValue: 'gallery' },
      sortOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await qi.addIndex('PetImages', ['petId', 'kind', 'sortOrder']);

    // La imagen única que ya tenían las mascotas pasa a ser la primera foto de su galería
    await qi.sequelize.query(`
      INSERT INTO "PetImages" (id, "petId", url, key, kind, "sortOrder", "createdAt", "updatedAt")
      SELECT uuid_generate_v4(), id, "imageUrl", "imageKey", 'gallery', 0, NOW(), NOW()
      FROM "Pets" WHERE "imageUrl" IS NOT NULL`);
  },

  async down(qi) {
    await qi.dropTable('PetImages');
    await qi.sequelize.query('DROP TYPE IF EXISTS "enum_PetImages_kind"');
  },
};
