const { Op } = require('sequelize');
const { sequelize, Pet, PetImage, PetClinic, User, VetClinic, Appointment } = require('../../models');
const storage = require('../../providers/storage');
const AppError = require('../../utils/AppError');
const { escapeLike } = require('../../utils/escape');
const { sameCity, COMMISSION_RATE } = require('../../config/business');
const { fitsWithin } = require('../../utils/schedule');
const { toPetDTO } = require('./pet.dto');

const OWNER_ATTRS = ['id', 'fullName', 'role', 'isVerified', 'suspendedAt', 'ratingAverage', 'ratingCount'];
const imagesInclude = { model: PetImage, as: 'images' };
const clinicsInclude = () => ({
  model: VetClinic, as: 'clinics', through: { attributes: ['availability'] },
  attributes: ['id', 'name', 'address', 'city', 'phone', 'schedule', 'status', 'isActive'],
});
exports.clinicsInclude = clinicsInclude;

// Precio publicado (con comisión) calculado en SQL, igual que publicPriceOf(): price + ROUND(price * tasa)
const PUBLIC_PRICE_SQL = `("Pet"."price" + ROUND("Pet"."price" * ${Number(COMMISSION_RATE)}))`;
exports.PUBLIC_PRICE_SQL = PUBLIC_PRICE_SQL;

const clinicError = (field, message) => AppError.badRequest('Datos inválidos', [{ field: `body.${field}`, message }]);

// Valida las veterinarias elegidas para una mascota y devuelve las filas de PetClinics
const resolveClinics = async (city, clinicIds, availabilityList = []) => {
  const clinics = await VetClinic.findAll({ where: { id: clinicIds } });
  const byId = new Map(clinics.map((c) => [c.id, c]));
  for (const id of clinicIds) {
    const c = byId.get(id);
    if (!c) throw clinicError('clinicIds', 'Una de las veterinarias no existe');
    if (c.status !== 'approved' || !c.isActive) throw clinicError('clinicIds', `La veterinaria "${c.name}" no está habilitada`);
    if (!sameCity(c.city, city)) throw clinicError('clinicIds', `La veterinaria "${c.name}" no es de ${city}`);
  }
  const availability = new Map();
  for (const { clinicId, availability: av } of availabilityList) {
    const c = byId.get(clinicId);
    if (!c) throw clinicError('clinicAvailability', 'Hay un horario para una veterinaria que no elegiste');
    if (c.schedule && !fitsWithin(av, c.schedule)) {
      throw clinicError('clinicAvailability', `Tu horario en "${c.name}" se sale del horario de la veterinaria`);
    }
    availability.set(clinicId, av);
  }
  return clinicIds.map((clinicId) => ({ clinicId, availability: availability.get(clinicId) ?? null }));
};
// El ENUM de Postgres ordena por declaración: gallery, mother, father
const IMAGES_ORDER = [[imagesInclude, 'kind', 'ASC'], [imagesInclude, 'sortOrder', 'ASC']];

// Aplana el `req.files` de multer.fields() a [{ kind, sortOrder, file }]
const collectImages = (files = {}) => [
  ...(files.gallery || []).map((file, i) => ({ kind: 'gallery', sortOrder: i, file })),
  ...(files.motherPhoto || []).map((file) => ({ kind: 'mother', sortOrder: 0, file })),
  ...(files.fatherPhoto || []).map((file) => ({ kind: 'father', sortOrder: 0, file })),
];

const assertRequiredImages = (items) => {
  const has = (kind) => items.some((i) => i.kind === kind);
  const missing = [];
  if (!has('gallery')) missing.push({ field: 'gallery', message: 'Sube al menos 1 foto de la mascota (máximo 3)' });
  if (!has('mother')) missing.push({ field: 'motherPhoto', message: 'La foto de la madre es obligatoria' });
  if (!has('father')) missing.push({ field: 'fatherPhoto', message: 'La foto del padre es obligatoria' });
  if (missing.length) throw AppError.badRequest('Faltan imágenes obligatorias', missing);
};

const removeAll = (keys) => Promise.allSettled(keys.filter(Boolean).map((k) => storage.remove(k)));

// Sube todo en paralelo; si una falla, borra las que sí subieron para no dejar huérfanas
const uploadAll = async (items) => {
  const results = await Promise.allSettled(
    items.map((i) => storage.upload(i.file.buffer, { folder: 'pets', ext: 'webp' })));
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) {
    await removeAll(results.filter((r) => r.status === 'fulfilled').map((r) => r.value.key));
    throw failed.reason;
  }
  return items.map((i, idx) => ({ kind: i.kind, sortOrder: i.sortOrder, ...results[idx].value }));
};

exports.list = async (q) => {
  const { page, limit } = q;
  const where = { status: 'available' };
  const and = [];
  if (q.city) where.city = { [Op.iLike]: `%${escapeLike(q.city)}%` };
  if (q.breed) where.breed = { [Op.iLike]: `%${escapeLike(q.breed)}%` };
  if (q.q) {
    const term = `%${escapeLike(q.q)}%`;
    where[Op.or] = [{ name: { [Op.iLike]: term } }, { breed: { [Op.iLike]: term } }, { city: { [Op.iLike]: term } }];
  }
  if (q.filter === 'adopcion') where.adoptionType = 'adoption';
  if (q.adoptionType) where.adoptionType = q.adoptionType;
  const ageRange = {
    ...(q.filter === 'cachorros' ? { [Op.lte]: 12 } : {}),
    ...(q.minAgeMonths !== undefined ? { [Op.gte]: q.minAgeMonths } : {}),
    ...(q.maxAgeMonths !== undefined ? { [Op.lte]: q.maxAgeMonths } : {}),
  };
  if (Reflect.ownKeys(ageRange).length) where.ageMonths = ageRange;
  // Los filtros de precio usan el precio publicado (con comisión), que es el que ve el comprador
  if (q.minPrice !== undefined) and.push(sequelize.where(sequelize.literal(PUBLIC_PRICE_SQL), { [Op.gte]: q.minPrice }));
  if (q.maxPrice !== undefined) and.push(sequelize.where(sequelize.literal(PUBLIC_PRICE_SQL), { [Op.lte]: q.maxPrice }));
  if (and.length) where[Op.and] = and;

  // Las publicaciones de cuentas suspendidas no se muestran
  const ownerWhere = { suspendedAt: null };
  if (q.filter === 'criador') ownerWhere.role = 'breeder';
  if (q.sellerRole) ownerWhere.role = q.sellerRole;
  if (q.verified === true) ownerWhere.isVerified = true;

  const order = {
    recent: [['createdAt', 'DESC']],
    price_asc: [['price', 'ASC'], ['createdAt', 'DESC']],
    price_desc: [['price', 'DESC'], ['createdAt', 'DESC']],
  }[q.sort || 'recent'];

  const { rows, count } = await Pet.findAndCountAll({
    where,
    include: [{ model: User, as: 'owner', attributes: OWNER_ATTRS, required: true, where: ownerWhere }, clinicsInclude()],
    distinct: true, col: 'id', order, limit, offset: (page - 1) * limit,
  });
  return { items: rows.map(toPetDTO), meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};

exports.listMine = async (user, { page, limit }) => {
  const { rows, count } = await Pet.findAndCountAll({
    where: { ownerId: user.id }, include: [clinicsInclude()], distinct: true, col: 'id',
    order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit,
  });
  return { items: rows.map(toPetDTO), meta: { page, limit, total: count } };
};

exports.getById = async (id) => {
  const pet = await Pet.findByPk(id, {
    include: [{ model: User, as: 'owner', attributes: OWNER_ATTRS }, imagesInclude, clinicsInclude()],
    order: IMAGES_ORDER,
  });
  if (!pet || pet.owner?.suspendedAt) throw AppError.notFound('Mascota no encontrada');
  return toPetDTO(pet);
};

exports.create = async (user, { clinicIds, clinicAvailability, ...data }, files) => {
  const items = collectImages(files);
  assertRequiredImages(items);
  if (data.adoptionType === 'sale' && !clinicIds?.length) {
    throw clinicError('clinicIds', 'Elige al menos una veterinaria de entrega');
  }
  const clinicRows = clinicIds?.length ? await resolveClinics(data.city, clinicIds, clinicAvailability) : [];

  const uploaded = await uploadAll(items);
  const cover = uploaded.find((i) => i.kind === 'gallery');
  let petId;
  try {
    petId = await sequelize.transaction(async (t) => {
      const pet = await Pet.create(
        { ...data, ownerId: user.id, imageUrl: cover.url, imageKey: cover.key }, { transaction: t });
      await PetImage.bulkCreate(uploaded.map((i) => ({ ...i, petId: pet.id })), { transaction: t });
      await PetClinic.bulkCreate(clinicRows.map((r) => ({ ...r, petId: pet.id })), { transaction: t });
      return pet.id;
    });
  } catch (err) {
    await removeAll(uploaded.map((i) => i.key));
    throw err;
  }
  return exports.getById(petId);
};

// Las imágenes son opcionales al editar. Si llega `gallery` reemplaza la galería completa;
// si llega `motherPhoto`/`fatherPhoto` reemplaza solo esa foto.
// Veterinarias al editar: si llega `clinicIds` reemplaza la lista completa; si no, se deja como está.
// Si solo llega `clinicAvailability`, actualiza el horario en las veterinarias actuales.
const planClinicChanges = async (pet, data, clinicIds, clinicAvailability) => {
  const city = data.city ?? pet.city;
  const current = pet.clinics.map((c) => c.id);
  if (clinicIds) return { replace: await resolveClinics(city, clinicIds, clinicAvailability) };
  if (data.city && !sameCity(data.city, pet.city) && current.length) {
    throw clinicError('clinicIds', 'Cambiaste la ciudad: elige veterinarias de la ciudad nueva');
  }
  if (clinicAvailability) return { replace: await resolveClinics(city, current, clinicAvailability) };
  return null;
};

exports.update = async (user, id, { clinicIds, clinicAvailability, ...data }, files) => {
  const pet = await Pet.findByPk(id, { include: [imagesInclude, clinicsInclude()] });
  if (!pet) throw AppError.notFound('Mascota no encontrada');
  if (pet.ownerId !== user.id) throw AppError.forbidden('No puedes editar una mascota que no es tuya');
  const clinicPlan = await planClinicChanges(pet, data, clinicIds, clinicAvailability);

  const uploaded = await uploadAll(collectImages(files));
  const replacedKinds = new Set(uploaded.map((i) => i.kind));
  const replaced = pet.images.filter((i) => replacedKinds.has(i.kind));
  const cover = uploaded.find((i) => i.kind === 'gallery');

  try {
    await sequelize.transaction(async (t) => {
      if (replaced.length) await PetImage.destroy({ where: { id: replaced.map((i) => i.id) }, transaction: t });
      if (uploaded.length) await PetImage.bulkCreate(uploaded.map((i) => ({ ...i, petId: pet.id })), { transaction: t });
      await pet.update({ ...data, ...(cover ? { imageUrl: cover.url, imageKey: cover.key } : {}) }, { transaction: t });
      if (clinicPlan) {
        await PetClinic.destroy({ where: { petId: pet.id }, transaction: t });
        await PetClinic.bulkCreate(clinicPlan.replace.map((r) => ({ ...r, petId: pet.id })), { transaction: t });
      }
    });
  } catch (err) {
    await removeAll(uploaded.map((i) => i.key));
    throw err;
  }
  // Solo se borran del storage las imágenes viejas cuando la BD ya confirmó el cambio
  await removeAll(replaced.map((i) => i.key));
  return exports.getById(pet.id);
};

exports.remove = async (user, id) => {
  const pet = await Pet.findByPk(id, { include: [imagesInclude] });
  if (!pet) throw AppError.notFound('Mascota no encontrada');
  if (pet.ownerId !== user.id) throw AppError.forbidden('No puedes eliminar una mascota que no es tuya');
  if (pet.status === 'in_process') throw AppError.conflict('No puedes eliminar una mascota con una cita activa');
  // Mientras alguien paga la reserva la mascota sigue "available": tampoco se puede borrar
  if (await Appointment.count({ where: { petId: pet.id, status: 'pending_payment' } })) {
    throw AppError.conflict('Hay una reserva de esta mascota en proceso de pago. Intenta de nuevo en unos minutos.');
  }

  const keys = new Set([pet.imageKey, ...pet.images.map((i) => i.key)]);
  await sequelize.transaction(async (t) => {
    // Pet es paranoid (soft delete), así que el CASCADE de la FK no se dispara: se limpian a mano
    await PetImage.destroy({ where: { petId: pet.id }, transaction: t });
    await pet.destroy({ transaction: t });
  });
  await removeAll([...keys]);
};
