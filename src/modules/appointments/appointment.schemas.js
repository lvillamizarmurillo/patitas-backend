const { z } = require('zod');
const { uuid, idParam } = require('../../utils/schemas');

exports.byId = idParam;

// El horario (veterinaria, vendedor y ventana de días) se valida en el service porque depende de la BD
const meetingDate = z.coerce.date()
  .refine((d) => d.getTime() > Date.now() + 60 * 60 * 1000, 'La fecha debe ser al menos 1 hora en el futuro');

exports.create = {
  body: z.object({
    petId: uuid,
    clinicId: uuid,
    meetingDate,
    notes: z.string().trim().max(500).optional(),
    // Obligatorio en ventas: commission = paga la comisión en línea; full = paga todo en línea
    paymentOption: z.enum(['commission', 'full']).optional(),
  }),
};

exports.updateStatus = {
  params: idParam.params,
  body: z.object({ status: z.enum(['confirmed', 'cancelled', 'completed']) }),
};

exports.propose = {
  params: idParam.params,
  body: z.object({ meetingDate }),
};

exports.list = {
  query: z.object({
    status: z.enum(['pending_payment', 'pending', 'confirmed', 'completed', 'cancelled']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
};
