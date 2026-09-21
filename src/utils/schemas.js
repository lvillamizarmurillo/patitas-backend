const { z } = require('zod');
exports.uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'ID inválido');
exports.idParam = { params: z.object({ id: exports.uuid }) };