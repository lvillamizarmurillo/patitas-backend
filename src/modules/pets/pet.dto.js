const toImageDTO = (i) => ({ id: i.id, url: i.url, kind: i.kind, sortOrder: i.sortOrder });

exports.toPetDTO = (p) => ({
  id: p.id, name: p.name, breed: p.breed, sex: p.sex, ageMonths: p.ageMonths, city: p.city,
  description: p.description,
  price: Number(p.price),
  adoptionType: p.adoptionType, status: p.status,
  imageUrl: p.imageUrl, // portada = primera foto de la galería (para tarjetas y listados)
  images: p.images ? p.images.map(toImageDTO) : undefined,
  owner: p.owner
    ? { id: p.owner.id, name: p.owner.fullName, role: p.owner.role, isVerified: Boolean(p.owner.isVerified) }
    : undefined,
  createdAt: p.createdAt,
});
