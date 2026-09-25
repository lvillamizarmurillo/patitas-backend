const { Contract, Appointment, Pet } = require('../../models');
const storage = require('../../providers/storage');
const AppError = require('../../utils/AppError');

exports.download = async (req, res) => {
  const { appointmentId } = req.params;
  const contract = await Contract.findOne({ where: { appointmentId } });
  if (!contract) throw AppError.notFound('El contrato aún no se ha generado');

  const appt = await Appointment.findByPk(appointmentId, { include: [{ model: Pet, as: 'pet' }] });
  if (!appt) throw AppError.notFound('El contrato aún no se ha generado');

  const isOwner = appt.pet.ownerId === req.user.id;
  const isAdopter = appt.adopterId === req.user.id;
  if (!isOwner && !isAdopter) throw AppError.notFound('El contrato aún no se ha generado');

  const url = await storage.getSignedUrl(contract.pdfKey, { expiresInSeconds: 300 });
  res.json({ data: { url, contractNumber: contract.contractNumber, expiresIn: 300 } });
};