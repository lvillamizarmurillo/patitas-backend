'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await qi.createTable('Users', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      role: { type: Sequelize.ENUM('adopter', 'shelter', 'breeder', 'individual', 'admin'), allowNull: false, defaultValue: 'adopter' },
      fullName: { type: Sequelize.STRING, allowNull: false },
      city: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      phone: { type: Sequelize.STRING, allowNull: false },
      password: { type: Sequelize.STRING, allowNull: false },
      termsAccepted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      termsAcceptedAt: { type: Sequelize.DATE },
      termsVersion: { type: Sequelize.STRING(20) },
      isVerified: { type: Sequelize.BOOLEAN, defaultValue: false },
      verifiedAt: { type: Sequelize.DATE },
      verifiedBy: { type: Sequelize.UUID },
      deletedAt: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await qi.createTable('VetClinics', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false },
      address: { type: Sequelize.STRING, allowNull: false },
      city: { type: Sequelize.STRING, allowNull: false },
      phone: { type: Sequelize.STRING },
      openingHours: { type: Sequelize.STRING },
      isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await qi.createTable('Pets', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false },
      breed: { type: Sequelize.STRING, allowNull: false },
      sex: { type: Sequelize.ENUM('male', 'female', 'unknown'), allowNull: false, defaultValue: 'unknown' },
      ageMonths: { type: Sequelize.INTEGER, allowNull: false },
      city: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.TEXT },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      adoptionType: { type: Sequelize.ENUM('adoption', 'sale'), allowNull: false, defaultValue: 'adoption' },
      status: { type: Sequelize.ENUM('available', 'in_process', 'adopted'), allowNull: false, defaultValue: 'available' },
      imageUrl: { type: Sequelize.STRING },
      imageKey: { type: Sequelize.STRING },
      ownerId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      deletedAt: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await qi.createTable('Appointments', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      meetingDate: { type: Sequelize.DATE, allowNull: false },
      status: { type: Sequelize.ENUM('pending', 'confirmed', 'completed', 'cancelled'), defaultValue: 'pending' },
      notes: { type: Sequelize.TEXT },
      adopterId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      petId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Pets', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      clinicId: { type: Sequelize.UUID, allowNull: false, references: { model: 'VetClinics', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      deletedAt: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await qi.createTable('Contracts', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      appointmentId: { type: Sequelize.UUID, allowNull: false, unique: true, references: { model: 'Appointments', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      contractNumber: { type: Sequelize.STRING, allowNull: false, unique: true },
      pdfKey: { type: Sequelize.STRING, allowNull: false },
      sha256: { type: Sequelize.STRING, allowNull: false },
      templateVersion: { type: Sequelize.STRING, defaultValue: '1.0' },
      deletedAt: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await qi.createTable('Favorites', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      userId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      petId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Pets', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await qi.createTable('RefreshTokens', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      userId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      tokenHash: { type: Sequelize.STRING(64), allowNull: false },
      userAgent: { type: Sequelize.STRING },
      expiresAt: { type: Sequelize.DATE, allowNull: false },
      revokedAt: { type: Sequelize.DATE },
      replacedByTokenHash: { type: Sequelize.STRING(64) },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await qi.addIndex('Pets', ['ownerId']);
    await qi.addIndex('Pets', ['status', 'city']);
    await qi.addIndex('Appointments', ['adopterId']);
    await qi.addIndex('Appointments', ['petId']);
    await qi.addIndex('Appointments', ['clinicId']);
    await qi.addIndex('Favorites', ['userId', 'petId'], { unique: true });
    await qi.addIndex('RefreshTokens', ['userId']);
    await qi.addIndex('RefreshTokens', ['tokenHash'], { unique: true });

    await qi.sequelize.query(`
      CREATE UNIQUE INDEX uniq_active_appt_per_pet ON "Appointments" ("petId")
      WHERE status IN ('pending','confirmed')`);
  },

  async down(qi) {
    await qi.dropTable('RefreshTokens');
    await qi.dropTable('Favorites');
    await qi.dropTable('Contracts');
    await qi.dropTable('Appointments');
    await qi.dropTable('Pets');
    await qi.dropTable('VetClinics');
    await qi.dropTable('Users');
    for (const t of ['enum_Users_role', 'enum_Pets_sex', 'enum_Pets_adoptionType', 'enum_Pets_status', 'enum_Appointments_status']) {
      await qi.sequelize.query(`DROP TYPE IF EXISTS "${t}"`);
    }
  },
};