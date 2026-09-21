exports.toPetDTO = (p) => ({
  id: p.id, name: p.name, breed: p.breed, ageMonths: p.ageMonths, city: p.city,
  price: Number(p.price), // DECIMAL llega como string desde pg
  adoptionType: p.adoptionType, status: p.status, imageUrl: p.imageUrl,
  owner: p.owner ? { id: p.owner.id, name: p.owner.fullName, role: p.owner.role } : undefined,
  createdAt: p.createdAt,
});