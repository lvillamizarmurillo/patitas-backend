const { z } = require('zod');
const { idParam, pagination, uuid } = require('../../utils/schemas');

exports.listOrgs = { query: z.object({ status: z.enum(['pending', 'verified', 'all']).default('pending') }) };
exports.verify = { params: idParam.params };

exports.listUsers = {
  query: z.object({
    role: z.enum(['adopter', 'shelter', 'breeder', 'individual', 'admin', 'staff']).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    status: z.enum(['active', 'suspended', 'all']).default('all'),
    ...pagination,
  }),
};

exports.suspend = {
  params: idParam.params,
  body: z.object({ reason: z.string().trim().min(3).max(500).optional() }).default({}),
};
exports.reactivate = { params: idParam.params };

exports.listAppointments = {
  query: z.object({
    status: z.enum(['pending_payment', 'pending', 'confirmed', 'completed', 'cancelled']).optional(),
    ...pagination,
  }),
};

exports.listPayments = {
  query: z.object({
    status: z.enum(['pending', 'approved', 'declined', 'voided', 'error', 'expired', 'refunded']).optional(),
    refundStatus: z.enum(['required', 'refunded']).optional(),
    ...pagination,
  }),
};
exports.updateRefund = {
  params: idParam.params,
  body: z.object({ refundStatus: z.enum(['required', 'refunded']), refundNote: z.string().trim().max(1000).optional() }),
};

exports.listPayouts = { query: z.object({ status: z.enum(['pending', 'paid']).optional(), ...pagination }) };
exports.markPayoutPaid = {
  params: idParam.params,
  body: z.object({ transferReference: z.string().trim().min(3).max(120) }),
};

exports.listAudit = {
  query: z.object({ actorId: uuid.optional(), action: z.string().trim().max(60).optional(), ...pagination }),
};
