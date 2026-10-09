const { z } = require('zod');
const { idParam, uuid } = require('../../utils/schemas');
const { scheduleSchema } = require('../../utils/schedule');
const { MAX_CLINICS_PER_PET } = require('../../config/business');

exports.byId = idParam;

const money = z.coerce.number().min(0).max(1_000_000_000);
const age = z.coerce.number().int().min(0).max(360);

exports.list = {
  query: z.object({
    city: z.string().trim().max(80).optional(),
    breed: z.string().trim().max(80).optional(),
    q: z.string().trim().min(1).max(80).optional(), // texto libre: raza, nombre o ciudad
    filter: z.enum(['adopcion', 'cachorros', 'criador']).optional(), // compatibilidad con el front anterior
    adoptionType: z.enum(['sale', 'adoption']).optional(),
    minPrice: money.optional(), // sobre el precio publicado (con comisión)
    maxPrice: money.optional(),
    minAgeMonths: age.optional(),
    maxAgeMonths: age.optional(),
    verified: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    sellerRole: z.enum(['breeder', 'individual', 'shelter']).optional(),
    sort: z.enum(['recent', 'price_asc', 'price_desc']).default('recent'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  }).refine((d) => d.minPrice === undefined || d.maxPrice === undefined || d.minPrice <= d.maxPrice, {
    message: 'El precio mínimo no puede ser mayor que el máximo', path: ['minPrice'],
  }).refine((d) => d.minAgeMonths === undefined || d.maxAgeMonths === undefined || d.minAgeMonths <= d.maxAgeMonths, {
    message: 'La edad mínima no puede ser mayor que la máxima', path: ['minAgeMonths'],
  }),
};

exports.mine = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  }),
};

// En multipart `clinicIds` llega una vez por veterinaria: string si es una sola, arreglo si son varias
const clinicIds = z.preprocess(
  (v) => (v === undefined || v === '' ? undefined : [...new Set(Array.isArray(v) ? v : [v])]),
  z.array(uuid).min(1, 'Elige al menos una veterinaria').max(MAX_CLINICS_PER_PET, `Máximo ${MAX_CLINICS_PER_PET} veterinarias`),
).optional();

// `clinicAvailability` llega como texto JSON: [{ clinicId, availability }]
const clinicAvailability = z.preprocess(
  (v) => {
    if (v === undefined || v === '') return undefined;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return v; }
  },
  z.array(z.object({ clinicId: uuid, availability: scheduleSchema })).max(MAX_CLINICS_PER_PET),
).optional();

exports.create = {
  body: z.object({
    name: z.string().trim().min(1).max(80),
    breed: z.string().trim().min(2).max(80),
    sex: z.enum(['male', 'female', 'unknown']).default('unknown'),
    ageMonths: age,
    city: z.string().trim().min(2).max(80),
    description: z.string().trim().max(1000).optional(),
    adoptionType: z.enum(['adoption', 'sale']).default('adoption'),
    price: z.coerce.number().min(0).max(100_000_000).default(0), // lo que recibe el vendedor (sin comisión)
    clinicIds,
    clinicAvailability,
  }).refine((d) => d.adoptionType === 'sale' || d.price === 0, {
    message: 'Una adopción no puede tener precio', path: ['price'],
  }),
};

exports.update = {
  params: idParam.params,
  body: z.object({
    name: z.string().trim().min(1).max(80).optional(),
    breed: z.string().trim().min(2).max(80).optional(),
    sex: z.enum(['male', 'female', 'unknown']).optional(),
    description: z.string().trim().max(1000).optional(),
    ageMonths: age.optional(),
    city: z.string().trim().min(2).max(80).optional(),
    price: z.coerce.number().min(0).max(100_000_000).optional(),
    clinicIds,
    clinicAvailability,
  }),
};
