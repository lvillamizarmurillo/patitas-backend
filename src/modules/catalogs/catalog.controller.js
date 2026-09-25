const service = require('./catalog.service');
exports.getFilters = async (_req, res) => res.json({ data: await service.getFilters() });
exports.getClinics = async (req, res) => res.json({ data: await service.getClinics(req.query.city) });