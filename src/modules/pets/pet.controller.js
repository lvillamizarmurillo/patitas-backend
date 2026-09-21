const service = require('./pet.service');

exports.list = async (req, res) => res.json({ data: await service.list(req.valid.query) });
exports.getById = async (req, res) => res.json({ data: await service.getById(req.valid.params.id) });
exports.create = async (req, res) =>
  res.status(201).json({ data: await service.create(req.user, req.valid.body, req.file) });