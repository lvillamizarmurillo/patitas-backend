const { commissionOf, publicPriceOf } = require('../../config/business');
const { DEFAULT_SCHEDULE } = require('../../utils/schedule');

const toImageDTO = (i) => ({ id: i.id, url: i.url, kind: i.kind, sortOrder: i.sortOrder });

// Promedio público del vendedor (sin comentarios: esos nunca salen en rutas públicas)
const toRating = (u) => (u?.ratingCount > 0 ? { average: Number(Number(u.ratingAverage).toFixed(1)), count: u.ratingCount } : null);

const toPetClinicDTO = (c) => ({
  id: c.id, name: c.name, address: c.address, city: c.city, phone: c.phone ?? null,
  schedule: c.schedule || DEFAULT_SCHEDULE,
  availability: c.PetClinic?.availability ?? null, // horario del vendedor en esta veterinaria (null = todo el de la veterinaria)
  isActive: c.status === 'approved' && Boolean(c.isActive), // false = deshabilitada: no se puede agendar ahí
});

exports.toPetClinicDTO = toPetClinicDTO;

exports.toPetDTO = (p) => {
  const price = Number(p.price);
  return {
    id: p.id, name: p.name, breed: p.breed, sex: p.sex, ageMonths: p.ageMonths, city: p.city,
    description: p.description,
    price, // lo que recibe el vendedor
    commission: p.adoptionType === 'sale' ? commissionOf(price) : 0,
    publicPrice: p.adoptionType === 'sale' ? publicPriceOf(price) : 0, // lo que ve y paga el comprador
    adoptionType: p.adoptionType, status: p.status,
    imageUrl: p.imageUrl, // portada = primera foto de la galería (para tarjetas y listados)
    images: p.images ? p.images.map(toImageDTO) : undefined,
    clinics: (p.clinics || []).map(toPetClinicDTO),
    owner: p.owner
      ? {
        id: p.owner.id, name: p.owner.fullName, role: p.owner.role,
        isVerified: Boolean(p.owner.isVerified), rating: toRating(p.owner),
      }
      : undefined,
    createdAt: p.createdAt,
  };
};
