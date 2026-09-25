'use strict';
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

module.exports = {
  async up(qi) {
    const hash = (pwd) => bcrypt.hashSync(pwd, 12);
    const shelterId = randomUUID();
    const adopterId = randomUUID();
    const adminId = randomUUID();
    const clinic1 = randomUUID();
    const clinic2 = randomUUID();

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
      { id: randomUUID(), name: 'Nube', breed: 'Bulldog francés', sex: 'female', ageMonths: 4, city: 'Medellín',
        price: 3900000, adoptionType: 'sale', status: 'available', ownerId: shelterId,
        imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', createdAt: new Date(), updatedAt: new Date() },
      { id: randomUUID(), name: 'Tito', breed: 'Schnauzer', sex: 'male', ageMonths: 24, city: 'Bogotá',
        price: 0, adoptionType: 'adoption', status: 'available', ownerId: shelterId,
        imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', createdAt: new Date(), updatedAt: new Date() },
    ]);
  },

  async down(qi) {
    await qi.bulkDelete('Pets', null);
    await qi.bulkDelete('VetClinics', null);
    await qi.bulkDelete('Users', null);
  },
};