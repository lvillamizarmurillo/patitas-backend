const path = require('path');
const crypto = require('crypto');
const ejs = require('ejs');
const { Appointment, Pet, User, VetClinic, Contract } = require('../../models');
const { htmlToPdf } = require('./pdf.service');
const storage = require('../../providers/storage');
const AppError = require('../../utils/AppError');

exports.generateForAppointment = async (appointmentId) => {
  const existing = await Contract.findOne({ where: { appointmentId } });
  if (existing) return existing; // idempotente: si se reintenta, no duplica

  const appt = await Appointment.findByPk(appointmentId, {
    include: [
      { model: Pet, as: 'pet', include: [{ model: User, as: 'owner' }] },
      { model: User, as: 'adopter' },
      { model: VetClinic, as: 'clinic' },
    ],
  });
  if (!appt || appt.status !== 'completed') throw AppError.conflict('La cita no está completada');

  const contractNumber = `PAT-${new Date().getFullYear()}-${appt.id.slice(0, 8).toUpperCase()}`;
  const html = await ejs.renderFile(path.join(__dirname, 'templates/contract.ejs'), {
    contractNumber, pet: appt.pet, owner: appt.pet.owner, adopter: appt.adopter, clinic: appt.clinic,
    date: new Date().toLocaleDateString('es-CO', { dateStyle: 'long' }),
  });

  const pdf = await htmlToPdf(html);
  const sha256 = crypto.createHash('sha256').update(pdf).digest('hex'); // prueba de integridad
  const { key } = await storage.upload(pdf, { folder: 'contracts', ext: 'pdf', private: true });

  return Contract.create({ appointmentId, contractNumber, pdfKey: key, sha256 });
};