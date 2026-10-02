const { z } = require('zod');
const { idParam, pagination } = require('../../utils/schemas');

exports.list = {
  query: z.object({
    // ?unread=true → solo no leídas; ?unread=false → solo leídas; sin el parámetro → todas
    unread: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    ...pagination,
  }),
};

exports.byId = idParam;
