const service = require('./review.service');

exports.pending = async (req, res) => res.json({ data: await service.pending(req.user) });
exports.create = async (req, res) => res.status(201).json({ data: await service.create(req.user, req.valid.body) });
exports.mine = async (req, res) => res.json({ data: await service.mine(req.user) });
exports.adminList = async (req, res) => res.json({ data: await service.adminList(req.valid.query) });
exports.setHidden = async (req, res) => res.json({ data: await service.setHidden(req.user, req.valid.params.id, req.valid.body.hidden) });
