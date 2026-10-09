const service = require('./appointment.service');

// Comprador solicita una cita (en ventas con pago en línea, la respuesta trae payment.checkoutUrl)
exports.create = async (req, res) => {
  res.status(201).json({ data: await service.create(req.user, req.valid.body) });
};

// Citas donde participa el usuario (como comprador o como dueño de la mascota)
exports.list = async (req, res) => {
  res.json({ data: await service.list(req.user, req.valid.query) });
};

// Detalle de una cita (usado por la pantalla de seguimiento)
exports.getById = async (req, res) => {
  res.json({ data: await service.getById(req.user, req.valid.params.id) });
};

// Cambia el estado de la cita, validado por la máquina de estados del service
exports.updateStatus = async (req, res) => {
  res.json({ data: await service.updateStatus(req.user, req.valid.params.id, req.valid.body.status) });
};

// Otro horario: el vendedor propone, el comprador acepta o rechaza
exports.propose = async (req, res) => res.json({ data: await service.propose(req.user, req.valid.params.id, req.valid.body) });
exports.acceptProposal = async (req, res) => res.json({ data: await service.acceptProposal(req.user, req.valid.params.id) });
exports.rejectProposal = async (req, res) => res.json({ data: await service.rejectProposal(req.user, req.valid.params.id) });
