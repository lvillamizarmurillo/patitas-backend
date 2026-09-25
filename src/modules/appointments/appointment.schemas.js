const { z } = require('zod');
const { uuid, idParam } = require('../../utils/schemas');

exports.byId = idParam;

exports.create = {
  body: z.object({
    petId: uuid,
    clinicId: uuid,
    meetingDate: z.coerce.date().refine((d) => d.getTime() > Date.now() + 60 * 60 * 1000, 'La fecha debe ser al menos 1 hora en el futuro'),
    notes: z.string().trim().max(500).optional(),
  }),
};

exports.updateStatus = {
  params: idParam.params,
  body: z.object({ status: z.enum(['confirmed', 'cancelled', 'completed']) }),
};

exports.list = {
  query: z.object({
    status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
};