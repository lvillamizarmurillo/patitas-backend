const service = require('./alert.service');

exports.create = async (req, res) => res.status(201).json({ data: await service.create(req.user, req.valid.body) });
exports.list = async (req, res) => res.json({ data: await service.list(req.user) });
exports.remove = async (req, res) => {
  await service.remove(req.user, req.valid.params.id);
  res.status(204).send();
};
