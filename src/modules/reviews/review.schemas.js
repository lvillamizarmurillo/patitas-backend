const { z } = require('zod');
const { uuid, idParam, pagination } = require('../../utils/schemas');

exports.create = {
  body: z.object({
    appointmentId: uuid,
    dealClosed: z.boolean(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(500).optional().transform((v) => v || undefined),
  }),
};

exports.adminList = {
  query: z.object({
    sellerId: uuid.optional(),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    ...pagination,
  }),
};

exports.hide = { params: idParam.params, body: z.object({ hidden: z.boolean() }) };
