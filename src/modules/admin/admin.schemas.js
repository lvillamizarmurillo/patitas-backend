const { z } = require('zod');
const { idParam } = require('../../utils/schemas');
exports.listOrgs = { query: z.object({ status: z.enum(['pending', 'verified', 'all']).default('pending') }) };
exports.verify = { params: idParam.params };