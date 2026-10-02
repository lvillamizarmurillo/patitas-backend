const { z } = require('zod');
const { idParam } = require('../../utils/schemas');

const text = z.string().trim().min(2).max(80);
const price = z.coerce.number().min(0).max(100_000_000);

exports.create = {
  body: z.object({
    breed: text.optional(),
    city: text.optional(),
    minPrice: price.optional(),
    maxPrice: price.optional(),
    adoptionType: z.enum(['adoption', 'sale']).optional(),
  })
    .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Define al menos un filtro para la alerta' })
    .refine((d) => d.minPrice === undefined || d.maxPrice === undefined || d.minPrice <= d.maxPrice, {
      message: 'El precio mínimo no puede ser mayor que el máximo', path: ['minPrice'],
    }),
};

exports.byId = idParam;
