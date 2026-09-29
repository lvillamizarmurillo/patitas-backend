const { z } = require('zod');
const { email } = require('../../utils/schemas');

exports.subscribe = { body: z.object({ email }) };
exports.unsubscribe = { body: z.object({ email }) };
