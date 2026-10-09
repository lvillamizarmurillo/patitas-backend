const { Op, fn, col, where: sqlWhere } = require('sequelize');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { ALLOWED_CITIES, canonicalCity } = require('../../config/business');
const { VetClinic, Pet, PetClinic, User, StaffRole } = require('../../models');
const AppError = require('../../utils/AppError');
const mailer = require('../../utils/mailer');
const { escapeHtml } = require('../../utils/escape');
const { audit } = require('../../utils/audit');
const events = require('../notifications/notification.events');
const { toAdminClinicDTO, toPublicClinicDTO } = require('./clinic.dto');

const cityOrFail = (city) => {
  const canonical = canonicalCity(city);
  if (!canonical) {
    throw AppError.badRequest('Datos inválidos', [{
      field: 'body.city', message: `Por ahora solo operamos en ${ALLOWED_CITIES.join(', ')}`,
    }]);
  }
  return canonical;
};

// No puede haber dos veterinarias con el mismo nombre en la misma ciudad (sin importar mayúsculas)
const assertUniqueName = async (name, city, exceptId) => {
  const dup = await VetClinic.findOne({
    where: {
      city,
      [Op.and]: [sqlWhere(fn('lower', col('name')), name.trim().toLowerCase())],
      ...(exceptId ? { id: { [Op.ne]: exceptId } } : {}),
    },
  });
  if (dup) throw AppError.conflict(`Ya existe una veterinaria llamada "${dup.name}" en ${city}`);
};

const sendMail = (opts) => mailer.send(opts).catch((err) => logger.warn({ err }, 'No se pudo enviar el correo de veterinarias'));

// ---------- Catálogo público ----------

exports.listPublic = async ({ city } = {}) => {
  const where = { status: 'approved', isActive: true };
  if (city) where.city = canonicalCity(city) || city;
  const clinics = await VetClinic.findAll({ where, order: [['name', 'ASC']] });
  return clinics.map(toPublicClinicDTO);
};

// ---------- Solicitud pública ----------

// Admins y miembros del equipo con permiso `veterinarias` (para avisarles)
const clinicReviewers = async () => {
  const users = await User.findAll({
    where: { suspendedAt: null, role: ['admin', 'staff'] },
    attributes: ['id', 'role'],
    include: [{ model: StaffRole, as: 'staffRole', attributes: ['permissions'] }],
  });
  return users.filter((u) => u.role === 'admin' || u.staffRole?.permissions?.includes('veterinarias')).map((u) => u.id);
};

exports.request = async (data) => {
  const city = cityOrFail(data.city);
  await assertUniqueName(data.name, city);
  const clinic = await VetClinic.create({ ...data, city, status: 'pending', isActive: false });

  const reviewers = await clinicReviewers();
  await events.notify(reviewers.map((userId) => ({
    userId, type: 'clinic.requested', data: { clinicId: clinic.id, clinicName: clinic.name, city },
  })));
  if (env.SUPPORT_EMAIL) {
    sendMail({
      to: env.SUPPORT_EMAIL, replyTo: data.contactEmail,
      subject: `[${env.APP_NAME}] Nueva solicitud de veterinaria: ${clinic.name.slice(0, 60)}`,
      html: `<p><strong>${escapeHtml(clinic.name)}</strong> (${escapeHtml(city)}) pidió registrarse como veterinaria de entrega.</p>
        <p>Contacto: ${escapeHtml(data.contactName)} &lt;${escapeHtml(data.contactEmail)}&gt; · ${escapeHtml(data.phone)}</p>
        <p>Revísala en el panel admin, pestaña Veterinarias.</p>`,
    });
  }
  sendMail({
    to: data.contactEmail,
    subject: `Recibimos la solicitud de tu veterinaria — ${env.APP_NAME}`,
    html: `<p>Hola, recibimos la solicitud para registrar tu veterinaria. Nuestro equipo la revisará y te escribiremos a este correo.</p>
      <p>— Equipo ${escapeHtml(env.APP_NAME)}</p>`,
  });
  return toAdminClinicDTO(clinic);
};

// ---------- Administración ----------

exports.list = async ({ status }) => {
  const clinics = await VetClinic.findAll({
    where: status === 'all' ? {} : { status }, order: [['createdAt', 'DESC']],
  });
  return clinics.map(toAdminClinicDTO);
};

exports.create = async (actor, data) => {
  const city = cityOrFail(data.city);
  await assertUniqueName(data.name, city);
  const clinic = await VetClinic.create({ ...data, city, status: 'approved', isActive: true, reviewedBy: actor.id, reviewedAt: new Date() });
  await audit(actor, 'clinic.create', { type: 'clinic', id: clinic.id }, { name: clinic.name, city });
  return toAdminClinicDTO(clinic);
};

// Avisa al vendedor cuando a una de sus mascotas en venta no le queda ninguna veterinaria habilitada
const notifySellersWithoutClinics = async (clinicId) => {
  const links = await PetClinic.findAll({ where: { clinicId }, attributes: ['petId'] });
  if (!links.length) return;
  const pets = await Pet.findAll({
    where: { id: links.map((l) => l.petId), status: ['available', 'in_process'] },
    attributes: ['id', 'name', 'ownerId'],
    include: [{ model: VetClinic, as: 'clinics', attributes: ['id', 'status', 'isActive'], through: { attributes: [] } }],
  });
  const orphan = pets.filter((p) => !p.clinics.some((c) => c.status === 'approved' && c.isActive));
  await events.notify(orphan.map((p) => ({
    userId: p.ownerId, type: 'pet.clinics_unavailable', data: { petId: p.id, petName: p.name },
  })));
};

const findOr404 = async (id) => {
  const clinic = await VetClinic.findByPk(id);
  if (!clinic) throw AppError.notFound('Veterinaria no encontrada');
  return clinic;
};

exports.update = async (actor, id, data) => {
  const clinic = await findOr404(id);
  const changes = { ...data };
  if (data.city) changes.city = cityOrFail(data.city);
  if (data.name || data.city) await assertUniqueName(data.name || clinic.name, changes.city || clinic.city, clinic.id);
  if (data.isActive === true && clinic.status !== 'approved') {
    throw AppError.conflict('Solo se pueden habilitar veterinarias aprobadas');
  }
  const wasActive = clinic.isActive;
  await clinic.update(changes);
  await audit(actor, 'clinic.update', { type: 'clinic', id: clinic.id }, data);
  // Las citas ya agendadas se mantienen; solo se avisa a los vendedores que se quedaron sin veterinarias
  if (wasActive && data.isActive === false) await notifySellersWithoutClinics(clinic.id);
  return toAdminClinicDTO(clinic);
};

exports.approve = async (actor, id) => {
  const clinic = await findOr404(id);
  await clinic.update({ status: 'approved', isActive: true, rejectionReason: null, reviewedBy: actor.id, reviewedAt: new Date() });
  await audit(actor, 'clinic.approve', { type: 'clinic', id: clinic.id });
  if (clinic.contactEmail) {
    sendMail({
      to: clinic.contactEmail,
      subject: `Tu veterinaria fue aprobada en ${env.APP_NAME}`,
      html: `<p>¡Buenas noticias! <strong>${escapeHtml(clinic.name)}</strong> ya está habilitada como veterinaria de entrega.
        Los vendedores de ${escapeHtml(clinic.city)} podrán elegirla para entregar sus mascotas.</p>
        <p>— Equipo ${escapeHtml(env.APP_NAME)}</p>`,
    });
  }
  return toAdminClinicDTO(clinic);
};

exports.reject = async (actor, id, { reason } = {}) => {
  const clinic = await findOr404(id);
  const wasActive = clinic.isActive;
  await clinic.update({ status: 'rejected', isActive: false, rejectionReason: reason ?? null, reviewedBy: actor.id, reviewedAt: new Date() });
  await audit(actor, 'clinic.reject', { type: 'clinic', id: clinic.id }, { reason });
  if (wasActive) await notifySellersWithoutClinics(clinic.id);
  if (clinic.contactEmail) {
    sendMail({
      to: clinic.contactEmail,
      subject: `Sobre la solicitud de tu veterinaria — ${env.APP_NAME}`,
      html: `<p>Revisamos la solicitud de <strong>${escapeHtml(clinic.name)}</strong> y por ahora no pudimos aprobarla.</p>
        ${reason ? `<p><strong>Motivo:</strong> ${escapeHtml(reason)}</p>` : ''}
        <p>Si quieres, responde este correo o vuelve a enviar la solicitud con los datos corregidos.</p>`,
    });
  }
  return toAdminClinicDTO(clinic);
};
