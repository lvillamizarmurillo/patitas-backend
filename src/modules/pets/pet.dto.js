exports.toPetDTO = (p) => ({
  id: p.id, name: p.name, breed: p.breed, sex: p.sex, ageMonths: p.ageMonths, city: p.city,
  description: p.description,
  price: Number(p.price),
  adoptionType: p.adoptionType, status: p.status, imageUrl: p.imageUrl,
  owner: p.owner ? { id: p.owner.id, name: p.owner.fullName, role: p.owner.role } : undefined,
  createdAt: p.createdAt,
});