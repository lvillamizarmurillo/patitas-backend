const fs = require('fs');
const path = require('path');
const request = require('supertest');
const sharp = require('sharp');
const app = require('../src/app');
const { sequelize, User, VetClinic } = require('../src/models');
const mailer = require('../src/utils/mailer');

const API = '/api/v1';
const api = () => request(app);
const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Vacía todas las tablas (menos SequelizeMeta) entre archivos/tests
const resetDb = async () => {
  const tables = Object.values(sequelize.models).map((m) => `"${m.getTableName()}"`).join(', ');
  await sequelize.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
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

const createClinic = (overrides = {}) =>
  VetClinic.create({ name: 'Clínica Test', address: 'Calle 1', city: 'Cali', isActive: true, ...overrides });

let imgCache;
const validImage = async () => {
  imgCache ??= await sharp({ create: { width: 800, height: 600, channels: 3, background: '#c08040' } }).jpeg().toBuffer();
  return imgCache;
};
const jpg = (name) => ({ filename: `${name}.jpg`, contentType: 'image/jpeg' });

// POST /pets multipart. images: { gallery: n, mother: bool, father: bool, buffer?: Buffer }
const createPet = async (token, fields = {}, images = {}) => {
  const { gallery = 1, mother = true, father = true } = images;
  const buf = images.buffer || await validImage();
  const req = api().post(`${API}/pets`).set(auth(token));
  const data = { name: 'Luna', breed: 'Beagle', sex: 'female', ageMonths: 3, city: 'Cali', adoptionType: 'sale', price: 1500000, ...fields };
  Object.entries(data).forEach(([k, v]) => req.field(k, String(v)));
  for (let i = 0; i < gallery; i += 1) req.attach('gallery', buf, jpg(`g${i}`));
  if (mother) req.attach('motherPhoto', buf, jpg('madre'));
  if (father) req.attach('fatherPhoto', buf, jpg('padre'));
  return req;
};

const uploadedFileExists = (url) => fs.existsSync(path.join(__dirname, '../public/uploads', path.basename(url)));

// Captura los correos en vez de enviarlos y hace creer a la app que el SMTP está configurado
const captureMail = () => {
  const sent = [];
  jest.spyOn(mailer, 'send').mockImplementation(async (m) => { sent.push(m); });
  jest.spyOn(mailer, 'isConfigured').mockReturnValue(true);
  return sent;
};

const futureDate = (days = 7) => new Date(Date.now() + days * 86400000).toISOString();

module.exports = {
  API, api, auth, resetDb, createUser, createClinic, createPet, validImage, jpg, uploadedFileExists, captureMail, futureDate,
};
