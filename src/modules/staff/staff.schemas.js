const { z } = require('zod');
const { idParam, uuid } = require('../../utils/schemas');
const { PERMISSION_KEYS } = require('../../config/permissions');

const role = {
  name: z.string().trim().min(3).max(60),
  description: z.string().trim().max(300).optional().nullable(),
  permissions: z.array(z.enum(PERMISSION_KEYS, { errorMap: () => ({ message: `Permiso inválido. Válidos: ${PERMISSION_KEYS.join(', ')}` }) }))
    .min(1, 'Elige al menos un permiso')
    .transform((p) => [...new Set(p)]),
};

exports.create = { body: z.object(role) };
exports.update = {
  params: idParam.params,
  body: z.object({ name: role.name.optional(), description: role.description, permissions: role.permissions.optional() })
    .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Envía al menos un campo para actualizar' }),
};
exports.byId = idParam;
exports.assign = { params: idParam.params, body: z.object({ roleId: uuid.nullable() }) };
