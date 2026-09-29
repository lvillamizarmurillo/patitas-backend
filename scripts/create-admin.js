// Crea (o promueve) el usuario administrador SIN usar el seed de demo, que tiene contraseñas públicas.
// Uso (en la terminal del contenedor en Dokploy):
//   ADMIN_EMAIL=tu@correo.com ADMIN_PASSWORD='Clave-Larga-2026!' ADMIN_NAME='Tu Nombre' node scripts/create-admin.js
const { z } = require('zod');
const { email, password } = require('../src/utils/schemas');

const input = z.object({
  ADMIN_EMAIL: email,
  ADMIN_PASSWORD: password.min(12, 'La contraseña del admin debe tener al menos 12 caracteres'),
  ADMIN_NAME: z.string().trim().min(3).max(120).default('Administrador Patitas'),
  ADMIN_CITY: z.string().trim().min(2).max(80).default('Bogotá'),
  ADMIN_PHONE: z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/).default('+570000000000'),
}).safeParse(process.env);

if (!input.success) {
  input.error.issues.forEach((i) => console.error(`❌ ${i.path.join('.')}: ${i.message}`));
  process.exit(1);
}

const { sequelize, User } = require('../src/models');

(async () => {
  const d = input.data;
  const existing = await User.findOne({ where: { email: d.ADMIN_EMAIL } });
  if (existing) {
    // El hook beforeUpdate hashea la contraseña
    await existing.update({ role: 'admin', password: d.ADMIN_PASSWORD, isVerified: true });
    console.log(`✅ Usuario existente ${d.ADMIN_EMAIL} promovido a admin y contraseña actualizada.`);
  } else {
    await User.create({
      role: 'admin', email: d.ADMIN_EMAIL, password: d.ADMIN_PASSWORD, fullName: d.ADMIN_NAME,
      city: d.ADMIN_CITY, phone: d.ADMIN_PHONE, isVerified: true, verifiedAt: new Date(),
      termsAccepted: true, termsAcceptedAt: new Date(), termsVersion: '2026-01',
    });
    console.log(`✅ Admin ${d.ADMIN_EMAIL} creado.`);
  }
  await sequelize.close();
})().catch(async (err) => {
  console.error('❌ No se pudo crear el admin:', err.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
