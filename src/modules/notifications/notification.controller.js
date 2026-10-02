const service = require('./notification.service');

exports.list = async (req, res) => res.json({ data: await service.list(req.user, req.valid.query) });
exports.markRead = async (req, res) => res.json({ data: await service.markRead(req.user, req.valid.params.id) });
exports.markAllRead = async (req, res) => res.json({ data: await service.markAllRead(req.user) });
