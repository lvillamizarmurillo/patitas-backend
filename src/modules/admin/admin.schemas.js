const { z } = require('zod');
const { idParam, pagination } = require('../../utils/schemas');

exports.listOrgs = { query: z.object({ status: z.enum(['pending', 'verified', 'all']).default('pending') }) };
exports.verify = { params: idParam.params };

exports.listUsers = {
  query: z.object({
    role: z.enum(['adopter', 'shelter', 'breeder', 'individual', 'admin']).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    ...pagination,
  }),
};

exports.listAppointments = {
  query: z.object({
    status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']).optional(),
    ...pagination,
  }),
};
