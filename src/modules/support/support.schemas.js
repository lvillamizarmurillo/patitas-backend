const { z } = require('zod');
const { email } = require('../../utils/schemas');

// name/email son opcionales porque si hay sesión se toman del usuario autenticado
exports.contact = {
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    email: email.optional(),
    message: z.string().trim().min(10, 'El mensaje debe tener al menos 10 caracteres').max(2000),
  }),
};
