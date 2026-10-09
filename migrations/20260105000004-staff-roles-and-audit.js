'use strict';

module.exports = {
  async up(qi, Sequelize) {
    // Cuentas del equipo con permisos limitados al panel admin
    await qi.sequelize.query(`ALTER TYPE "enum_Users_role" ADD VALUE IF NOT EXISTS 'staff'`);

    await qi.createTable('StaffRoles', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(60), allowNull: false },
      description: { type: Sequelize.STRING(300) },
      permissions: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await qi.sequelize.query('CREATE UNIQUE INDEX staff_roles_name_unique ON "StaffRoles" (lower(name))');

    await qi.addColumn('Users', 'staffRoleId', { type: Sequelize.UUID, references: { model: 'StaffRoles', key: 'id' }, onDelete: 'SET NULL' });
    // Rol que tenía antes de pasar al equipo, para devolvérselo al quitarle el rol
    await qi.addColumn('Users', 'previousRole', { type: Sequelize.STRING(20) });

    // Registro de auditoría de las acciones del panel admin
    await qi.createTable('AuditLogs', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      actorId: { type: Sequelize.UUID, references: { model: 'Users', key: 'id' }, onDelete: 'SET NULL' },
      action: { type: Sequelize.STRING(60), allowNull: false },
      targetType: { type: Sequelize.STRING(40) },
      targetId: { type: Sequelize.UUID },
      details: { type: Sequelize.JSONB },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await qi.addIndex('AuditLogs', ['createdAt']);
    await qi.addIndex('AuditLogs', ['actorId']);
  },

  async down(qi) {
    await qi.dropTable('AuditLogs');
    await qi.removeColumn('Users', 'previousRole');
    await qi.removeColumn('Users', 'staffRoleId');
    await qi.dropTable('StaffRoles');
    // 'staff' queda en el ENUM (Postgres no permite quitar valores)
  },
};
