const { Pet, User, VetClinic } = require('../../models');

// Razas y ciudades que hoy tienen algo publicado: solo mascotas disponibles de cuentas no suspendidas
const distinctAvailable = async (column) => {
  const rows = await Pet.findAll({
    attributes: [column],
    where: { status: 'available' },
    include: [{ model: User, as: 'owner', attributes: [], where: { suspendedAt: null }, required: true }],
    group: [`Pet.${column}`],
    order: [[column, 'ASC']],
    raw: true,
  });
  return rows.map((r) => r[column]);
};

exports.getFilters = async () => {
  const [breeds, cities] = await Promise.all([distinctAvailable('breed'), distinctAvailable('city')]);
  return { breeds, cities };
};

exports.getClinics = async (city) => {
  const where = { isActive: true, ...(city ? { city } : {}) };
  return VetClinic.findAll({ where, order: [['name', 'ASC']] });
};
