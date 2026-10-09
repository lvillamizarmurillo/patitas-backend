const { DEFAULT_SCHEDULE } = require('../../utils/schedule');

// Para el catálogo público, publicar y agendar
exports.toPublicClinicDTO = (c) => ({
  id: c.id, name: c.name, address: c.address, city: c.city, phone: c.phone ?? null,
  schedule: c.schedule || DEFAULT_SCHEDULE,
});

// Para el panel admin (incluye datos de contacto de la solicitud)
exports.toAdminClinicDTO = (c) => ({
  ...exports.toPublicClinicDTO(c),
  isActive: Boolean(c.isActive), status: c.status,
  contactName: c.contactName ?? null, contactEmail: c.contactEmail ?? null,
  rejectionReason: c.rejectionReason ?? null, reviewedAt: c.reviewedAt ?? null, createdAt: c.createdAt,
});
