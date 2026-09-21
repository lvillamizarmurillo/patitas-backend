const service = require('./auth.service');

exports.register = async (req, res) => res.status(201).json({ data: await service.register(req.valid.body) });
exports.login = async (req, res) => res.json({ data: await service.login(req.valid.body) });
exports.me = async (req, res) => res.json({ data: await service.me(req.user.id) });