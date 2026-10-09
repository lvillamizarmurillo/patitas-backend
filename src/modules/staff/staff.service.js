const { fn, col, where: sqlWhere, Op, UniqueConstraintError } = require('sequelize');
const { sequelize, StaffRole, User, RefreshToken } = require('../../models');
const AppError = require('../../utils/AppError');
const { audit } = require('../../utils/audit');
const { PERMISSIONS } = require('../../config/permissions');

const toRoleDTO = (r, memberCount = 0) => ({
  id: r.id, name: r.name, description: r.description ?? null, permissions: r.permissions, memberCount, createdAt: r.createdAt,
});

const assertUniqueName = async (name, exceptId) => {
  const dup = await StaffRole.findOne({
    where: { [Op.and]: [sqlWhere(fn('lower', col('name')), name.toLowerCase())], ...(exceptId ? { id: { [Op.ne]: exceptId } } : {}) },
  });
  if (dup) throw AppError.conflict(`Ya existe un rol llamado "${dup.name}"`);
};

const findOr404 = async (id) => {
  const role = await StaffRole.findByPk(id);
  if (!role) throw AppError.notFound('Rol no encontrado');
  return role;
};

// Cierra las sesiones de la cuenta para que vea sus permisos nuevos al volver a entrar
// (los permisos igual se aplican de inmediato en el servidor: el middleware los lee en cada petición)
const revokeSessions = (userId, transaction) =>
  RefreshToken.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null }, transaction });

exports.catalog = () => Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description }));

exports.list = async () => {
  const [roles, members] = await Promise.all([
    StaffRole.findAll({ order: [['name', 'ASC']] }),
    User.findAll({
      where: { role: 'staff' }, attributes: ['id', 'fullName', 'email', 'staffRoleId'],
      include: [{ model: StaffRole, as: 'staffRole', attributes: ['id', 'name'] }], order: [['fullName', 'ASC']],
    }),
  ]);
  const counts = members.reduce((m, u) => m.set(u.staffRoleId, (m.get(u.staffRoleId) || 0) + 1), new Map());
  return {
    roles: roles.map((r) => toRoleDTO(r, counts.get(r.id) || 0)),
    members: members.map((u) => ({
      id: u.id, fullName: u.fullName, email: u.email, staffRole: u.staffRole ? { id: u.staffRole.id, name: u.staffRole.name } : null,
    })),
    permissions: exports.catalog(),
  };
};

const guardUnique = async (fnc) => {
  try {
    return await fnc();
  } catch (err) {
    if (err instanceof UniqueConstraintError) throw AppError.conflict('Ya existe un rol con ese nombre');
    throw err;
  }
};

exports.create = async (actor, data) => {
  await assertUniqueName(data.name);
  const role = await guardUnique(() => StaffRole.create(data));
  await audit(actor, 'role.create', { type: 'staff_role', id: role.id }, data);
  return toRoleDTO(role);
};

exports.update = async (actor, id, data) => {
  const role = await findOr404(id);
  if (data.name) await assertUniqueName(data.name, id);
  await guardUnique(() => role.update(data));
  await audit(actor, 'role.update', { type: 'staff_role', id }, data);
  const memberCount = await User.count({ where: { staffRoleId: id } });
  return toRoleDTO(role, memberCount);
};

exports.remove = async (actor, id) => {
  const role = await findOr404(id);
  const memberCount = await User.count({ where: { staffRoleId: id } });
  if (memberCount) throw AppError.conflict(`No se puede borrar: ${memberCount} persona(s) tienen este rol`);
  await role.destroy();
  await audit(actor, 'role.delete', { type: 'staff_role', id }, { name: role.name });
};

// Con roleId: la cuenta pasa a `staff` con ese rol. Con null: vuelve al rol que tenía (o comprador).
exports.assign = async (actor, userId, roleId) => {
  if (userId === actor.id) throw AppError.forbidden('No puedes cambiar tu propio rol');
  const user = await User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuario no encontrado');
  if (user.role === 'admin') throw AppError.forbidden('No se puede cambiar el rol del administrador principal');

  await sequelize.transaction(async (t) => {
    if (roleId) {
      const role = await StaffRole.findByPk(roleId, { transaction: t });
      if (!role) throw AppError.notFound('Rol no encontrado');
      await user.update({
        role: 'staff', staffRoleId: role.id, previousRole: user.role === 'staff' ? user.previousRole : user.role,
      }, { transaction: t });
    } else {
      if (user.role !== 'staff') return;
      await user.update({ role: user.previousRole || 'adopter', staffRoleId: null, previousRole: null }, { transaction: t });
    }
    await revokeSessions(user.id, t);
  });
  await audit(actor, 'role.assign', { type: 'user', id: userId }, { roleId });
  const fresh = await User.findByPk(userId, { include: [{ model: StaffRole, as: 'staffRole', attributes: ['id', 'name'] }] });
  return {
    id: fresh.id, fullName: fresh.fullName, email: fresh.email, role: fresh.role,
    staffRole: fresh.staffRole ? { id: fresh.staffRole.id, name: fresh.staffRole.name } : null,
  };
};
