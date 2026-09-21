const { Op } = require('sequelize');
const { Pet, User } = require('../../models');
const storage = require('../../providers/storage');
const AppError = require('../../utils/AppError');
const { toPetDTO } = require('./pet.dto');

const escapeLike = (s) => s.replace(/[\\%_]/g, '\\$&'); // el usuario no puede inyectar comodines

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
    if (image) await storage.remove(image.key).catch(() => {}); // sin imágenes huérfanas
    throw err;
  }
};