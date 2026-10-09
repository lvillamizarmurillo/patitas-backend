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
    const clinic3 = randomUUID();
    const clinic4 = randomUUID();
    const pet1 = randomUUID();
    const pet2 = randomUUID();
    const sampleImg = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';

    await qi.bulkInsert('Users', [
      { id: shelterId, role: 'shelter', fullName: 'Refugio Patitas Unidas', city: 'Bucaramanga',
        email: 'hola@refugiopatasunidas.org', phone: '+573000000001', password: hash('Refugio2026!'),
        termsAccepted: true, termsAcceptedAt: new Date(), termsVersion: '2026-01',
        isVerified: true, verifiedAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
      { id: adopterId, role: 'adopter', fullName: 'Ana María Ríos', city: 'Floridablanca',
        email: 'ana@correo.com', phone: '+573000000000', password: hash('Adoptante2026!'),
        termsAccepted: true, termsAcceptedAt: new Date(), termsVersion: '2026-01',
        createdAt: new Date(), updatedAt: new Date() },
      { id: adminId, role: 'admin', fullName: 'Admin Patitas', city: 'Bucaramanga',
        email: 'admin@patitas.app', phone: '+573000000002', password: hash('Admin2026Seguro!'),
        termsAccepted: true, termsAcceptedAt: new Date(), termsVersion: '2026-01',
        isVerified: true, createdAt: new Date(), updatedAt: new Date() },
    ]);

    // Veterinarias de entrega de demo en las tres ciudades donde se opera (horario semanal en hora de Colombia)
    const weekdays = (open, close) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => [d, { open, close }]));
    const clinic = (id, name, address, city, phone, schedule, extra = {}) => ({
      id, name, address, city, phone, schedule: JSON.stringify(schedule), status: 'approved', isActive: true,
      createdAt: new Date(), updatedAt: new Date(), ...extra,
    });
    await qi.bulkInsert('VetClinics', [
      clinic(clinic1, 'Veterinaria Cabecera', 'Calle 48 # 33-21, Cabecera', 'Bucaramanga', '607 643 2211',
        { ...weekdays('08:00', '18:00'), sat: { open: '08:00', close: '13:00' }, sun: null }),
      clinic(clinic2, 'Clínica Veterinaria Cañaveral', 'Autopista Floridablanca # 150-10', 'Floridablanca', '607 619 8800',
        { ...weekdays('09:00', '19:00'), sat: { open: '09:00', close: '14:00' }, sun: null }),
      clinic(clinic3, 'Vet Piedecuesta Centro', 'Carrera 6 # 10-45', 'Piedecuesta', '607 655 1020',
        { ...weekdays('08:00', '17:00'), sat: null, sun: null }),
      // Una solicitud por revisar, para probar el panel admin
      clinic(clinic4, 'Mascotas Felices Real de Minas', 'Calle 60 # 9-30', 'Bucaramanga', '317 555 0101',
        { ...weekdays('08:00', '18:00'), sat: null, sun: null },
        { status: 'pending', isActive: false, contactName: 'Laura Gómez', contactEmail: 'laura@mascotasfelices.co' }),
    ]);

    await qi.bulkInsert('Pets', [
      { id: pet1, name: 'Nube', breed: 'Bulldog francés', sex: 'female', ageMonths: 4, city: 'Bucaramanga',
        price: 3900000, adoptionType: 'sale', status: 'available', ownerId: shelterId,
        imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', createdAt: new Date(), updatedAt: new Date() },
      { id: pet2, name: 'Tito', breed: 'Schnauzer', sex: 'male', ageMonths: 24, city: 'Floridablanca',
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

    // Veterinarias de entrega de cada mascota (availability null = todo el horario de la veterinaria)
    await qi.bulkInsert('PetClinics', [
      { petId: pet1, clinicId: clinic1, availability: null, createdAt: new Date(), updatedAt: new Date() },
      { petId: pet2, clinicId: clinic2, availability: null, createdAt: new Date(), updatedAt: new Date() },
    ]);
  },

  async down(qi) {
    await qi.bulkDelete('PetClinics', null);
    await qi.bulkDelete('PetImages', null);
    await qi.bulkDelete('Pets', null);
    await qi.bulkDelete('VetClinics', null);
    await qi.bulkDelete('Users', null);
  },
};