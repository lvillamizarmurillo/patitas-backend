const service = require('./support.service');

exports.contact = async (req, res) =>
  res.status(201).json({ data: await service.contact(req.user, req.valid.body) });

// Bandeja del admin
exports.adminList = async (req, res) => res.json({ data: await service.adminList(req.valid.query) });
exports.stats = async (_req, res) => res.json({ data: await service.stats() });
exports.update = async (req, res) => res.json({ data: await service.update(req.user, req.valid.params.id, req.valid.body) });
exports.reply = async (req, res) => res.json({ data: await service.reply(req.user, req.valid.params.id, req.valid.body) });
