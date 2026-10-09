const { z } = require('zod');
const { email, password } = require('../../utils/schemas');

const phone = z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/, 'Teléfono inválido');

exports.register = {
  body: z.object({
    role: z.enum(['adopter', 'shelter', 'breeder', 'individual']), // 'admin' excluido a propósito: nunca por registro público
    fullName: z.string().trim().min(3).max(120),
    city: z.string().trim().min(2).max(80),
    email,
    phone,
    password,
    termsAccepted: z.boolean().refine((v) => v === true, 'Debes aceptar los términos'),
  }),
};

exports.login = {
  body: z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1).max(72),
  }),
};

exports.updateMe = {
  body: z.object({
    fullName: z.string().trim().min(3).max(120).optional(),
    city: z.string().trim().min(2).max(80).optional(),
    phone: phone.optional(),
    email: email.optional(),
    currentPassword: z.string().min(1).max(72).optional(), // obligatoria solo si cambia el email
  })
    .refine((d) => ['fullName', 'city', 'phone', 'email'].some((k) => d[k] !== undefined), {
      message: 'Envía al menos un campo para actualizar',
    }),
};

exports.changePassword = {
  body: z.object({
    currentPassword: z.string().min(1).max(72),
    newPassword: password,
  }).refine((d) => d.currentPassword !== d.newPassword, {
    message: 'La nueva contraseña debe ser distinta a la actual', path: ['newPassword'],
  }),
};

exports.forgotPassword = { body: z.object({ email }) };

exports.resetPassword = {
  body: z.object({
    token: z.string().regex(/^[0-9a-f]{64}$/i, 'Token inválido'),
    newPassword: password,
  }),
};

// Cuenta donde recibir lo de las ventas pagadas en línea
exports.payoutInfo = {
  body: z.object({
    method: z.enum(['bank', 'nequi', 'daviplata']),
    bankName: z.string().trim().min(2).max(80).optional(),
    accountType: z.enum(['ahorros', 'corriente']).optional(),
    accountNumber: z.string().trim().regex(/^[0-9-]{6,30}$/, 'Número de cuenta inválido'),
    holderName: z.string().trim().min(3).max(120),
    holderDocument: z.string().trim().regex(/^[0-9A-Za-z.-]{5,20}$/, 'Documento inválido'),
  }).refine((d) => d.method !== 'bank' || (d.bankName && d.accountType), {
    message: 'Para cuenta bancaria indica el banco y el tipo de cuenta', path: ['bankName'],
  }),
};
