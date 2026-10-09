const { z } = require('zod');
const { idParam, email } = require('../../utils/schemas');
const { scheduleSchema } = require('../../utils/schedule');

const phone = z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/, 'Teléfono inválido');
const base = {
  name: z.string().trim().min(3).max(120),
  address: z.string().trim().min(5).max(200),
  city: z.string().trim().min(2).max(80),
  phone,
  schedule: scheduleSchema,
};

exports.list = { query: z.object({ status: z.enum(['pending', 'approved', 'rejected', 'all']).default('all') }) };

exports.create = { body: z.object(base) };

exports.update = {
  params: idParam.params,
  body: z.object({
    name: base.name.optional(),
    address: base.address.optional(),
    city: base.city.optional(),
    phone: phone.optional(),
    schedule: scheduleSchema.optional(),
    isActive: z.boolean().optional(),
  }).refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Envía al menos un campo para actualizar' }),
};

exports.byId = idParam;

exports.reject = {
  params: idParam.params,
  body: z.object({ reason: z.string().trim().min(3).max(500).optional() }).default({}),
};

// Solicitud pública que manda la propia veterinaria
exports.request = {
  body: z.object({
    ...base,
    contactName: z.string().trim().min(3).max(120),
    contactEmail: email,
  }),
};

exports.publicList = { query: z.object({ city: z.string().trim().max(80).optional() }) };
