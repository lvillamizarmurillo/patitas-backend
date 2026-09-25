const service = require('./favorite.service');

exports.add = async (req, res) => { await service.add(req.user.id, req.params.id); res.status(201).json({ data: { favorited: true } }); };
exports.remove = async (req, res) => { await service.remove(req.user.id, req.params.id); res.json({ data: { favorited: false } }); };
exports.list = async (req, res) => res.json({ data: await service.list(req.user.id) });