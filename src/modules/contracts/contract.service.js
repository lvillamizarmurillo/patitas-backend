const path = require('path');
const crypto = require('crypto');
const ejs = require('ejs');
const { Op } = require('sequelize');
const logger = require('../../config/logger');
const { Appointment, Pet, User, VetClinic, Contract, Payment } = require('../../models');
const pdf = require('./pdf.service');
const storage = require('../../providers/storage');
const AppError = require('../../utils/AppError');
const events = require('../notifications/notification.events');

exports.MAX_ATTEMPTS = 5;

const money = (n) => `$${Number(n).toLocaleString('es-CO')}`;

exports.generateForAppointment = async (appointmentId) => {
  const existing = await Contract.findOne({ where: { appointmentId } });
  if (existing) return existing;

  const appt = await Appointment.findByPk(appointmentId, {
    include: [
      { model: Pet, as: 'pet', paranoid: false, include: [{ model: User, as: 'owner' }] },
      { model: User, as: 'adopter' },
      { model: VetClinic, as: 'clinic' },
      { model: Payment, as: 'payment' },
    ],
  });
  if (!appt || appt.status !== 'completed') throw AppError.conflict('La cita no está completada');

  // Desglose de la venta (13.7): precio del vendedor, comisión y opción de pago
  const option = appt.payment?.option || appt.paymentOption;
  let pricing = null;
  if (appt.pet.adoptionType === 'sale' && option) {
    const { breakdown } = require('../payments/payment.service');
    const b = breakdown(appt.pet.price, option);
    pricing = {
      sellerPrice: money(b.sellerPrice), commission: money(b.commission), total: money(b.sellerPrice + b.commission),
      option: option === 'full' ? 'Pago completo en línea' : 'Comisión en línea y saldo al vendedor en la cita',
      paidOnline: money(b.amount), paidAtMeeting: money(b.payAtMeeting),
    };
  }

  const contractNumber = `PAT-${new Date().getFullYear()}-${appt.id.slice(0, 8).toUpperCase()}`;
  const html = await ejs.renderFile(path.join(__dirname, 'template/contract.ejs'), {
    contractNumber, pet: appt.pet, owner: appt.pet.owner, adopter: appt.adopter, clinic: appt.clinic, pricing,
    date: new Date().toLocaleDateString('es-CO', { dateStyle: 'long' }),
  });

  const file = await pdf.htmlToPdf(html);
  const sha256 = crypto.createHash('sha256').update(file).digest('hex');
  const { key } = await storage.upload(file, { folder: 'contracts', ext: 'pdf', resourceType: 'raw', private: true });

  const contract = await Contract.create({ appointmentId, contractNumber, pdfKey: key, sha256 });
  // "¡Entrega completada!" se le avisa al comprador cuando el contrato ya existe
  await events.contractReady({ appt, pet: appt.pet });
  return contract;
};

// Un intento con registro de fallos. Al llegar a MAX_ATTEMPTS avisa (una vez) al comprador, al vendedor y al equipo.
exports.attempt = async (appointmentId) => {
  try {
    return await exports.generateForAppointment(appointmentId);
  } catch (err) {
    logger.error({ err, appointmentId }, 'Falló la generación del contrato');
    const appt = await Appointment.findByPk(appointmentId, { include: [{ model: Pet, as: 'pet', paranoid: false }] });
    if (!appt || appt.status !== 'completed') return null;
    await appt.increment('contractAttempts');
    await appt.reload();
    if (appt.contractAttempts >= exports.MAX_ATTEMPTS && !appt.contractFailedNotifiedAt) {
      await appt.update({ contractFailedNotifiedAt: new Date() });
      await events.contractFailed({ appt, pet: appt.pet });
    }
    return null;
  }
};

// Reintento periódico (lo llama el job de citas): completadas sin contrato y con intentos restantes.
// Espera 5 min si nunca se intentó (p. ej. el servidor se reinició) y luego 2, 4, 8, 16 min tras cada fallo.
const waitMs = (attempts) => (attempts === 0 ? 5 : 2 ** attempts) * 60000;

exports.retryPending = async (limit = 3, now = Date.now()) => {
  const appts = await Appointment.findAll({
    where: { status: 'completed', contractAttempts: { [Op.lt]: exports.MAX_ATTEMPTS } },
    include: [{ model: Contract, as: 'contract', required: false, attributes: ['id'] }],
    order: [['updatedAt', 'ASC']],
  });
  const due = appts.filter((a) => !a.contract && now - new Date(a.updatedAt).getTime() >= waitMs(a.contractAttempts))
    .slice(0, limit);
  for (const a of due) await exports.attempt(a.id);
  return due.length;
};
