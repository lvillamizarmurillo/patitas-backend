const fs = require('fs');
const path = require('path');
const request = require('supertest');
const sharp = require('sharp');
const app = require('../src/app');
const { sequelize, User, VetClinic, PetClinic } = require('../src/models');
const mailer = require('../src/utils/mailer');
const { availableSlots, intersect, DEFAULT_SCHEDULE } = require('../src/utils/schedule');

const API = '/api/v1';
const api = () => request(app);
const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Horario amplio (todos los días 06:00-22:00) para que siempre haya horarios en la ventana de agendamiento
const ALL_WEEK = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, { open: '06:00', close: '22:00' }]));

// Veterinaria por ciudad, creada a demanda para las ventas (se limpia con resetDb)
const clinicByCity = new Map();

// Vacía todas las tablas (menos SequelizeMeta) entre archivos/tests
const resetDb = async () => {
  const tables = Object.values(sequelize.models).map((m) => `"${m.getTableName()}"`).join(', ');
  await sequelize.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  clinicByCity.clear();
};

let seq = 0;
// Crea el usuario directo en BD (el endpoint de registro tiene rate limit de 5/h) e inicia sesión por la API
const createUser = async (overrides = {}) => {
  seq += 1;
  const password = overrides.password || 'Clave2026!';
  const user = await User.create({
    role: 'adopter', fullName: `Usuario Prueba ${seq}`, city: 'Bogotá', email: `usuario${seq}@test.com`,
    phone: '+573000000000', termsAccepted: true, ...overrides, password,
  });
  const res = await api().post(`${API}/auth/login`).send({ email: user.email, password });
  return { user, password, token: res.body.data?.accessToken, cookies: res.headers['set-cookie'] };
};

// Directo en BD (sin validar ciudad permitida), aprobada y habilitada
let clinicSeq = 0;
const createClinic = (overrides = {}) => {
  clinicSeq += 1;
  return VetClinic.create({
    name: `Clínica Test ${clinicSeq}`, address: 'Calle 1 # 2-3', city: 'Cali', phone: '6070000000',
    schedule: ALL_WEEK, status: 'approved', isActive: true, ...overrides,
  });
};

const clinicFor = async (city) => {
  const key = city.toLowerCase();
  if (!clinicByCity.has(key)) clinicByCity.set(key, await createClinic({ city }));
  return clinicByCity.get(key);
};

let imgCache;
const validImage = async () => {
  imgCache ??= await sharp({ create: { width: 800, height: 600, channels: 3, background: '#c08040' } }).jpeg().toBuffer();
  return imgCache;
};
const jpg = (name) => ({ filename: `${name}.jpg`, contentType: 'image/jpeg' });

// POST /pets multipart. images: { gallery: n, mother: bool, father: bool, buffer?: Buffer }
// En ventas, si no se pasa clinicIds, usa una veterinaria de la ciudad de la mascota (clinicIds: [] para no mandar ninguna)
const createPet = async (token, fields = {}, images = {}) => {
  const { gallery = 1, mother = true, father = true } = images;
  const buf = images.buffer || await validImage();
  const req = api().post(`${API}/pets`).set(auth(token));
  const { clinicIds, clinicAvailability, ...rest } = fields;
  const data = { name: 'Luna', breed: 'Beagle', sex: 'female', ageMonths: 3, city: 'Cali', adoptionType: 'sale', price: 1500000, ...rest };
  Object.entries(data).forEach(([k, v]) => req.field(k, String(v)));
  let ids = clinicIds;
  if (ids === undefined && data.adoptionType === 'sale') ids = [(await clinicFor(data.city)).id];
  (ids || []).forEach((id) => req.field('clinicIds', id));
  if (clinicAvailability) req.field('clinicAvailability', JSON.stringify(clinicAvailability));
  for (let i = 0; i < gallery; i += 1) req.attach('gallery', buf, jpg(`g${i}`));
  if (mother) req.attach('motherPhoto', buf, jpg('madre'));
  if (father) req.attach('fatherPhoto', buf, jpg('padre'));
  return req;
};

// Un horario válido: día `day` (0 = el primero disponible) de la ventana, horario número `index` de ese día
const slotFor = (schedule = ALL_WEEK, { day = 0, index = 0 } = {}, now = new Date()) => {
  const days = Object.values(availableSlots(schedule, now));
  if (!days[day]?.[index]) throw new Error('No hay horario disponible para el test');
  return days[day][index].toISOString();
};

// Horario efectivo para agendar una mascota en una veterinaria (veterinaria ∩ vendedor)
const scheduleFor = async (petId, clinicId) => {
  const clinic = await VetClinic.findByPk(clinicId);
  const link = await PetClinic.findOne({ where: { petId, clinicId } });
  return intersect(clinic.schedule || DEFAULT_SCHEDULE, link?.availability || null);
};

// POST /appointments con valores válidos por defecto. pet = DTO de la mascota.
// Se usa como una petición de supertest: `await book(...).expect(201)` o `await book(...)`.
const book = (token, pet, opts = {}) => {
  const ready = (async () => {
    const clinicId = opts.clinicId ?? pet.clinics?.[0]?.id ?? (await clinicFor(pet.city)).id;
    const meetingDate = opts.meetingDate ?? slotFor(await scheduleFor(pet.id, clinicId), opts.slot);
    const body = { petId: pet.id, clinicId, meetingDate, notes: opts.notes };
    if (pet.adoptionType === 'sale' && opts.paymentOption !== null) body.paymentOption = opts.paymentOption ?? 'commission';
    return { req: api().post(`${API}/appointments`).set(auth(token)).send(body) }; // envuelto: supertest es "thenable"
  })();
  return {
    expect: (status) => ready.then(({ req }) => req.expect(status)),
    then: (onDone, onError) => ready.then(({ req }) => req).then(onDone, onError),
  };
};

const uploadedFileExists = (url) => fs.existsSync(path.join(__dirname, '../public/uploads', path.basename(url)));

// Captura los correos en vez de enviarlos y hace creer a la app que el SMTP está configurado
const captureMail = () => {
  const sent = [];
  jest.spyOn(mailer, 'send').mockImplementation(async (m) => { sent.push(m); });
  jest.spyOn(mailer, 'isConfigured').mockReturnValue(true);
  return sent;
};

// Espera a que se cumpla una condición (p. ej. que llegue un correo que se envía en segundo plano)
const waitFor = async (check, { timeout = 3000, every = 25 } = {}) => {
  const start = Date.now();
  // eslint-disable-next-line no-await-in-loop
  while (!(await check())) {
    if (Date.now() - start > timeout) throw new Error('waitFor: la condición no se cumplió a tiempo');
    await new Promise((r) => setTimeout(r, every)); // eslint-disable-line no-await-in-loop
  }
};

module.exports = {
  waitFor,
  API, api, auth, resetDb, createUser, createClinic, clinicFor, createPet, validImage, jpg, uploadedFileExists, captureMail,
  ALL_WEEK, slotFor, scheduleFor, book,
};
