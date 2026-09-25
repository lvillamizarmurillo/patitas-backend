const service = require('./admin.service');
exports.listOrganizations = async (req, res) => res.json({ data: await service.listOrganizations(req.valid.query.status) });
exports.verify = async (req, res) => res.json({ data: await service.verify(req.user.id, req.params.id) });
exports.revoke = async (req, res) => res.json({ data: await service.revoke(req.params.id) });