const { z } = require('zod');
const { email, idParam, pagination } = require('../../utils/schemas');

exports.AUDIENCES = ['comprador', 'criadero', 'particular', 'veterinaria', 'otro'];
exports.TOPICS = ['cita', 'publicacion', 'pagos', 'cuenta', 'verificacion', 'veterinarias', 'otro'];

// name/email son opcionales porque si hay sesión se toman del usuario autenticado
exports.contact = {
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    email: email.optional(),
    phone: z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/, 'Teléfono inválido').optional(),
    audience: z.enum(exports.AUDIENCES).optional(), // "Soy…"
    topic: z.enum(exports.TOPICS).optional(), // "Tema"
    message: z.string().trim().min(10, 'El mensaje debe tener al menos 10 caracteres').max(2000),
  }),
};

// ---------- Bandeja del admin ----------

exports.adminList = {
  query: z.object({
    status: z.enum(['open', 'resolved', 'all']).default('open'),
    audience: z.enum(exports.AUDIENCES).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    ...pagination,
  }),
};

exports.adminUpdate = {
  params: idParam.params,
  body: z.object({
    status: z.enum(['open', 'resolved']).optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  }).refine((d) => d.status !== undefined || d.note !== undefined, { message: 'Envía status o note' }),
};

exports.adminReply = {
  params: idParam.params,
  body: z.object({
    message: z.string().trim().min(2).max(5000),
    resolve: z.boolean().default(false),
  }),
};
