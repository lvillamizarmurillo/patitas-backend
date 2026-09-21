const { z } = require('zod');

exports.register = {
  body: z.object({
    role: z.enum(['adopter', 'shelter', 'breeder', 'individual']),
    fullName: z.string().trim().min(3).max(120),
    city: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email().max(255),
    phone: z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/, 'Teléfono inválido'),
    password: z.string().min(8).max(72) // bcrypt ignora todo lo que pase de 72 bytes
      .regex(/[A-Z]/, 'Debe incluir una mayúscula')
      .regex(/[0-9]/, 'Debe incluir un número'),
    termsAccepted: z.boolean().refine((v) => v === true, 'Debes aceptar los términos'),
  }),
};

exports.login = {
  body: z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1).max(72),
  }),
};