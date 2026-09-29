const service = require('./support.service');

exports.contact = async (req, res) =>
  res.status(201).json({ data: await service.contact(req.user, req.valid.body) });
