const service = require('./admin.service');

exports.summary = async (_req, res) => res.json({ data: await service.summary() });

exports.listOrganizations = async (req, res) => res.json({ data: await service.listOrganizations(req.valid.query.status) });
exports.verify = async (req, res) => res.json({ data: await service.verify(req.user, req.valid.params.id) });
exports.revoke = async (req, res) => res.json({ data: await service.revoke(req.user, req.valid.params.id) });

exports.listUsers = async (req, res) => res.json({ data: await service.listUsers(req.valid.query) });
exports.suspend = async (req, res) => res.json({ data: await service.suspend(req.user, req.valid.params.id, req.valid.body) });
exports.reactivate = async (req, res) => res.json({ data: await service.reactivate(req.user, req.valid.params.id) });

exports.listAppointments = async (req, res) => res.json({ data: await service.listAppointments(req.valid.query) });

exports.listPayments = async (req, res) => res.json({ data: await service.listPayments(req.valid.query) });
exports.updateRefund = async (req, res) => res.json({ data: await service.updateRefund(req.user, req.valid.params.id, req.valid.body) });
exports.listPayouts = async (req, res) => res.json({ data: await service.listPayouts(req.valid.query) });
exports.markPayoutPaid = async (req, res) => res.json({ data: await service.markPayoutPaid(req.user, req.valid.params.id, req.valid.body) });

exports.listAudit = async (req, res) => res.json({ data: await service.listAudit(req.valid.query) });
