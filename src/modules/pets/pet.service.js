const { Op } = require('sequelize');
const { Pet, User } = require('../../models');
const storage = require('../../providers/storage');
const AppError = require('../../utils/AppError');
const { toPetDTO } = require('./pet.dto');

const escapeLike = (s) => s.replace(/[\\%_]/g, '\\$&');

exports.list = async ({ city, breed, filter, page, limit }) => {
  const where = { status: 'available' };
  if (city) where.city = { [Op.iLike]: `%${escapeLike(city)}%` };
  if (breed) where.breed = { [Op.iLike]: `%${escapeLike(breed)}%` };
  if (filter === 'adopcion') where.adoptionType = 'adoption';
  if (filter === 'cachorros') where.ageMonths = { [Op.lte]: 12 };

  const owner = { model: User, as: 'owner', attributes: ['id', 'fullName', 'role'] };
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
  const pet = await Pet.findByPk(id, { include: [{ model: User, as: 'owner', attributes: ['id', 'fullName', 'role'] }] });
  if (!pet) throw AppError.notFound('Mascota no encontrada');
  return toPetDTO(pet);
};

exports.create = async (user, data, file) => {
  const image = file ? await storage.upload(file.buffer, { folder: 'pets', ext: 'webp' }) : null;
  try {
    const pet = await Pet.create({ ...data, ownerId: user.id, imageUrl: image?.url ?? null, imageKey: image?.key ?? null });
    return toPetDTO(pet);
  } catch (err) {
    if (image) await storage.remove(image.key);
    throw err;
  }
};

exports.update = async (user, id, data, file) => {
  const pet = await Pet.findByPk(id);
  if (!pet) throw AppError.notFound('Mascota no encontrada');
  if (pet.ownerId !== user.id) throw AppError.forbidden('No puedes editar una mascota que no es tuya');

  let image = null;
  if (file) {
    image = await storage.upload(file.buffer, { folder: 'pets', ext: 'webp' });
    if (pet.imageKey) await storage.remove(pet.imageKey);
  }
  await pet.update({ ...data, ...(image ? { imageUrl: image.url, imageKey: image.key } : {}) });
  return toPetDTO(pet);
};

exports.remove = async (user, id) => {
  const pet = await Pet.findByPk(id);
  if (!pet) throw AppError.notFound('Mascota no encontrada');
  if (pet.ownerId !== user.id) throw AppError.forbidden('No puedes eliminar una mascota que no es tuya');
  if (pet.status === 'in_process') throw AppError.conflict('No puedes eliminar una mascota con una cita activa');
  if (pet.imageKey) await storage.remove(pet.imageKey);
  await pet.destroy();
};