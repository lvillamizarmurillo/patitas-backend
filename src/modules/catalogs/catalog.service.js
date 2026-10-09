const { Pet, User } = require('../../models');
const { COMMISSION_RATE } = require('../../config/business');

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

// Solo aprobadas y habilitadas, con teléfono y horario (las usan publicar y agendar)
exports.getClinics = (city) => require('../clinics/clinic.service').listPublic({ city });

exports.getPricing = () => ({ commissionRate: COMMISSION_RATE, currency: 'COP', paymentOptions: ['commission', 'full'] });
