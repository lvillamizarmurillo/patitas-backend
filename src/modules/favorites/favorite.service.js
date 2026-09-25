const { Favorite, Pet, User } = require('../../models');
const AppError = require('../../utils/AppError');
const { toPetDTO } = require('../pets/pet.dto');

exports.add = async (userId, petId) => {
  const pet = await Pet.findByPk(petId);
  if (!pet) throw AppError.notFound('Mascota no encontrada');
  const [fav] = await Favorite.findOrCreate({ where: { userId, petId } });
  return fav;
};

exports.remove = async (userId, petId) => {
  await Favorite.destroy({ where: { userId, petId } });
};

exports.list = async (userId) => {
  const favs = await Favorite.findAll({
    where: { userId },
    include: [{ model: Pet, as: 'pet', include: [{ model: User, as: 'owner', attributes: ['id', 'fullName', 'role'] }] }],
    order: [['createdAt', 'DESC']],
  });
  return favs.filter((f) => f.pet).map((f) => toPetDTO(f.pet));
};