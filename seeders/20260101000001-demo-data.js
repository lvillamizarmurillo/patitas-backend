'use strict';
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

module.exports = {
  async up(qi) {
    // Datos de demo con contraseñas públicas (están en el README): jamás en producción.
    // Para el admin real usa `npm run create-admin`.
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
      throw new Error('El seed de demo está bloqueado en producción. Usa `npm run create-admin`.');
    }
    const hash = (pwd) => bcrypt.hashSync(pwd, 12);
    const shelterId = randomUUID();
    const adopterId = randomUUID();
    const adminId = randomUUID();
    const clinic1 = randomUUID();
    const clinic2 = randomUUID();
    const pet1 = randomUUID();
    const pet2 = randomUUID();
    const sampleImg = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';

    await qi.bulkInsert('Users', [
      { id: shelterId, role: 'shelter', fullName: 'Refugio Patitas Unidas', city: 'Bogotá',
        email: 'hola@refugiopatasunidas.org', phone: '+573000000001', password: hash('Refugio2026!'),
        termsAccepted: true, termsAcceptedAt: new Date(), termsVersion: '2026-01',
        isVerified: true, verifiedAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
      { id: adopterId, role: 'adopter', fullName: 'Ana María Ríos', city: 'Medellín',
        email: 'ana@correo.com', phone: '+573000000000', password: hash('Adoptante2026!'),
        termsAccepted: true, termsAcceptedAt: new Date(), termsVersion: '2026-01',
        createdAt: new Date(), updatedAt: new Date() },
      { id: adminId, role: 'admin', fullName: 'Admin Patitas', city: 'Bogotá',
        email: 'admin@patitas.app', phone: '+573000000002', password: hash('Admin2026Seguro!'),
        termsAccepted: true, termsAcceptedAt: new Date(), termsVersion: '2026-01',
        isVerified: true, createdAt: new Date(), updatedAt: new Date() },
    ]);

    await qi.bulkInsert('VetClinics', [
      { id: clinic1, name: 'Maxcotas Center', address: 'Calle 10 # 43-20', city: 'Medellín',
        phone: '321 453 0334', openingHours: 'Lun-Sáb 8am-6pm', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { id: clinic2, name: 'Vet Salud Animal', address: 'Carrera 15 # 85-40', city: 'Bogotá',
        phone: '310 987 6543', openingHours: 'Lun-Vie 9am-7pm', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ]);

    await qi.bulkInsert('Pets', [
      { id: pet1, name: 'Nube', breed: 'Bulldog francés', sex: 'female', ageMonths: 4, city: 'Medellín',
        price: 3900000, adoptionType: 'sale', status: 'available', ownerId: shelterId,
        imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', createdAt: new Date(), updatedAt: new Date() },
      { id: pet2, name: 'Tito', breed: 'Schnauzer', sex: 'male', ageMonths: 24, city: 'Bogotá',
        price: 0, adoptionType: 'adoption', status: 'available', ownerId: shelterId,
        imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', createdAt: new Date(), updatedAt: new Date() },
    ]);

    // Galería (1-3) + madre + padre, igual que exige POST /pets. Sin `key`: son URLs públicas de demo.
    const img = (petId, kind, sortOrder = 0) => ({
      id: randomUUID(), petId, url: sampleImg, key: null, kind, sortOrder, createdAt: new Date(), updatedAt: new Date(),
    });
    await qi.bulkInsert('PetImages', [
      img(pet1, 'gallery', 0), img(pet1, 'gallery', 1), img(pet1, 'mother'), img(pet1, 'father'),
      img(pet2, 'gallery', 0), img(pet2, 'mother'), img(pet2, 'father'),
    ]);
  },

  async down(qi) {
    await qi.bulkDelete('PetImages', null);
    await qi.bulkDelete('Pets', null);
    await qi.bulkDelete('VetClinics', null);
    await qi.bulkDelete('Users', null);
  },
};