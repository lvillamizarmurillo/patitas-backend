const num = (v) => (v === null || v === undefined ? null : Number(v));

exports.toAlertDTO = (a) => ({
  id: a.id, breed: a.breed, city: a.city, minPrice: num(a.minPrice), maxPrice: num(a.maxPrice),
  adoptionType: a.adoptionType, lastNotifiedAt: a.lastNotifiedAt, createdAt: a.createdAt,
});
