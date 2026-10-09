const service = require('./clinic.service');

exports.request = async (req, res) => res.status(201).json({ data: await service.request(req.valid.body) });
exports.listPublic = async (req, res) => res.json({ data: await service.listPublic(req.valid.query) });

exports.list = async (req, res) => res.json({ data: await service.list(req.valid.query) });
exports.create = async (req, res) => res.status(201).json({ data: await service.create(req.user, req.valid.body) });
exports.update = async (req, res) => res.json({ data: await service.update(req.user, req.valid.params.id, req.valid.body) });
exports.approve = async (req, res) => res.json({ data: await service.approve(req.user, req.valid.params.id) });
exports.reject = async (req, res) => res.json({ data: await service.reject(req.user, req.valid.params.id, req.valid.body) });
