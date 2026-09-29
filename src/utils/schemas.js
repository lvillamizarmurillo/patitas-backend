const { z } = require('zod');
exports.uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'ID inválido');
exports.idParam = { params: z.object({ id: exports.uuid }) };
exports.email = z.string().trim().toLowerCase().email().max(255);
exports.password = z.string().min(8).max(72)
  .regex(/[A-Z]/, 'Debe incluir una mayúscula')
  .regex(/[0-9]/, 'Debe incluir un número');
exports.pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};
