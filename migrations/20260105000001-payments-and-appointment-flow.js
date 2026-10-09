'use strict';

module.exports = {
  async up(qi, Sequelize) {
    // Nuevo estado: la cita espera el pago en línea antes de llegarle al vendedor.
    // ADD VALUE no puede usarse dentro de la misma transacción: sequelize-cli corre esta migración sin transacción.
    await qi.sequelize.query(`ALTER TYPE "enum_Appointments_status" ADD VALUE IF NOT EXISTS 'pending_payment' BEFORE 'pending'`);

    // Una sola cita activa por mascota, ahora contando también la que espera pago (evita que dos compradores paguen)
    await qi.sequelize.query('DROP INDEX IF EXISTS uniq_active_appt_per_pet');
    await qi.sequelize.query(`
      CREATE UNIQUE INDEX uniq_active_appt_per_pet ON "Appointments" ("petId")
      WHERE status IN ('pending_payment','pending','confirmed') AND "deletedAt" IS NULL`);

    // Propuesta de otro horario, reintentos del contrato y encuesta
    await qi.addColumn('Appointments', 'proposedMeetingDate', { type: Sequelize.DATE });
    await qi.addColumn('Appointments', 'proposedAt', { type: Sequelize.DATE });
    await qi.addColumn('Appointments', 'contractAttempts', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    await qi.addColumn('Appointments', 'contractFailedNotifiedAt', { type: Sequelize.DATE });
    await qi.addColumn('Appointments', 'reviewRequestedAt', { type: Sequelize.DATE });
    // Opción de reserva elegida (commission | full); se guarda aunque el pago en línea esté deshabilitado
    await qi.addColumn('Appointments', 'paymentOption', { type: Sequelize.STRING(20) });

    await qi.createTable('Payments', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      appointmentId: { type: Sequelize.UUID, allowNull: false, unique: true, references: { model: 'Appointments', key: 'id' }, onDelete: 'CASCADE' },
      buyerId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE' },
      option: { type: Sequelize.ENUM('commission', 'full'), allowNull: false },
      sellerPrice: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      commission: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'COP' },
      status: { type: Sequelize.ENUM('pending', 'approved', 'declined', 'voided', 'error', 'expired', 'refunded'), allowNull: false, defaultValue: 'pending' },
      provider: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'wompi' },
      reference: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      providerTransactionId: { type: Sequelize.STRING(64) },
      checkoutUrl: { type: Sequelize.TEXT },
      expiresAt: { type: Sequelize.DATE, allowNull: false },
      approvedAt: { type: Sequelize.DATE },
      refundStatus: { type: Sequelize.STRING(20) }, // null | required | refunded
      refundNote: { type: Sequelize.TEXT },
      lastEvent: { type: Sequelize.JSONB },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await qi.addIndex('Payments', ['status']);

    // Desembolsos al vendedor cuando el comprador pagó el valor completo en línea
    await qi.createTable('Payouts', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      paymentId: { type: Sequelize.UUID, allowNull: false, unique: true, references: { model: 'Payments', key: 'id' }, onDelete: 'CASCADE' },
      appointmentId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Appointments', key: 'id' }, onDelete: 'CASCADE' },
      sellerId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE' },
      amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      status: { type: Sequelize.ENUM('pending', 'paid'), allowNull: false, defaultValue: 'pending' },
      paidAt: { type: Sequelize.DATE },
      paidBy: { type: Sequelize.UUID },
      transferReference: { type: Sequelize.STRING(120) },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await qi.addIndex('Payouts', ['status']);

    // Datos para pagarle al vendedor (cuenta bancaria o billetera)
    await qi.addColumn('Users', 'payoutInfo', { type: Sequelize.JSONB });
  },

  async down(qi) {
    await qi.removeColumn('Users', 'payoutInfo');
    await qi.dropTable('Payouts');
    await qi.dropTable('Payments');
    for (const t of ['enum_Payouts_status', 'enum_Payments_status', 'enum_Payments_option']) {
      await qi.sequelize.query(`DROP TYPE IF EXISTS "${t}"`);
    }
    for (const col of ['paymentOption', 'reviewRequestedAt', 'contractFailedNotifiedAt', 'contractAttempts', 'proposedAt', 'proposedMeetingDate']) {
      await qi.removeColumn('Appointments', col);
    }
    await qi.sequelize.query('DROP INDEX IF EXISTS uniq_active_appt_per_pet');
    await qi.sequelize.query(`CREATE UNIQUE INDEX uniq_active_appt_per_pet ON "Appointments" ("petId") WHERE status IN ('pending','confirmed')`);
    // Postgres no permite quitar un valor de un ENUM; 'pending_payment' queda sin uso.
  },
};
