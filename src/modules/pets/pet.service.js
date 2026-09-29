const { Op } = require('sequelize');
const { sequelize, Pet, PetImage, User } = require('../../models');
const storage = require('../../providers/storage');
const AppError = require('../../utils/AppError');
const { escapeLike } = require('../../utils/escape');
const { toPetDTO } = require('./pet.dto');

const OWNER_ATTRS = ['id', 'fullName', 'role', 'isVerified'];
const imagesInclude = { model: PetImage, as: 'images' };
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

exports.list = async ({ city, breed, filter, page, limit }) => {
  const where = { status: 'available' };
  if (city) where.city = { [Op.iLike]: `%${escapeLike(city)}%` };
  if (breed) where.breed = { [Op.iLike]: `%${escapeLike(breed)}%` };
  if (filter === 'adopcion') where.adoptionType = 'adoption';
  if (filter === 'cachorros') where.ageMonths = { [Op.lte]: 12 };

  const owner = { model: User, as: 'owner', attributes: OWNER_ATTRS };
  if (filter === 'criador') Object.assign(owner, { where: { role: 'breeder' }, required: true });

  const { rows, count } = await Pet.findAndCountAll({
    where, include: [owner], distinct: true,
    order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit,
  });
  return { items: rows.map(toPetDTO), meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};

exports.listMine = async (user, { page, limit }) => {
  const { rows, count } = await Pet.findAndCountAll({
    where: { ownerId: user.id }, order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit,
  });
  return { items: rows.map(toPetDTO), meta: { page, limit, total: count } };
};

exports.getById = async (id) => {
  const pet = await Pet.findByPk(id, {
    include: [{ model: User, as: 'owner', attributes: OWNER_ATTRS }, imagesInclude],
    order: IMAGES_ORDER,
  });
  if (!pet) throw AppError.notFound('Mascota no encontrada');
  return toPetDTO(pet);
};

exports.create = async (user, data, files) => {
  const items = collectImages(files);
  assertRequiredImages(items);

  const uploaded = await uploadAll(items);
  const cover = uploaded.find((i) => i.kind === 'gallery');
  let petId;
  try {
    petId = await sequelize.transaction(async (t) => {
      const pet = await Pet.create(
        { ...data, ownerId: user.id, imageUrl: cover.url, imageKey: cover.key }, { transaction: t });
      await PetImage.bulkCreate(uploaded.map((i) => ({ ...i, petId: pet.id })), { transaction: t });
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
exports.update = async (user, id, data, files) => {
  const pet = await Pet.findByPk(id, { include: [imagesInclude] });
  if (!pet) throw AppError.notFound('Mascota no encontrada');
  if (pet.ownerId !== user.id) throw AppError.forbidden('No puedes editar una mascota que no es tuya');

  const uploaded = await uploadAll(collectImages(files));
  const replacedKinds = new Set(uploaded.map((i) => i.kind));
  const replaced = pet.images.filter((i) => replacedKinds.has(i.kind));
  const cover = uploaded.find((i) => i.kind === 'gallery');

  try {
    await sequelize.transaction(async (t) => {
      if (replaced.length) await PetImage.destroy({ where: { id: replaced.map((i) => i.id) }, transaction: t });
      if (uploaded.length) await PetImage.bulkCreate(uploaded.map((i) => ({ ...i, petId: pet.id })), { transaction: t });
      await pet.update({ ...data, ...(cover ? { imageUrl: cover.url, imageKey: cover.key } : {}) }, { transaction: t });
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

  const keys = new Set([pet.imageKey, ...pet.images.map((i) => i.key)]);
  await sequelize.transaction(async (t) => {
    // Pet es paranoid (soft delete), así que el CASCADE de la FK no se dispara: se limpian a mano
    await PetImage.destroy({ where: { petId: pet.id }, transaction: t });
    await pet.destroy({ transaction: t });
  });
  await removeAll([...keys]);
};
