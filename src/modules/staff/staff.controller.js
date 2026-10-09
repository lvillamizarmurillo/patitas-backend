const service = require('./staff.service');

exports.list = async (_req, res) => res.json({ data: await service.list() });
exports.create = async (req, res) => res.status(201).json({ data: await service.create(req.user, req.valid.body) });
exports.update = async (req, res) => res.json({ data: await service.update(req.user, req.valid.params.id, req.valid.body) });
exports.remove = async (req, res) => {
  await service.remove(req.user, req.valid.params.id);
  res.status(204).send();
};
exports.assign = async (req, res) => res.json({ data: await service.assign(req.user, req.valid.params.id, req.valid.body.roleId) });
