const { z } = require('zod');
const { idParam } = require('../../utils/schemas');

exports.byId = idParam;

exports.list = {
  query: z.object({
    city: z.string().trim().max(80).optional(),
    breed: z.string().trim().max(80).optional(),
    filter: z.enum(['adopcion', 'cachorros', 'criador']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  }),
};

exports.create = {
  body: z.object({
    name: z.string().trim().min(1).max(80),
    breed: z.string().trim().min(2).max(80),
    ageMonths: z.coerce.number().int().min(0).max(360),
    city: z.string().trim().min(2).max(80),
    adoptionType: z.enum(['adoption', 'sale']).default('adoption'),
    price: z.coerce.number().min(0).max(100_000_000).default(0),
  }).refine((d) => d.adoptionType === 'sale' || d.price === 0, {
    message: 'Una adopción no puede tener precio', path: ['price'],
  }),
};