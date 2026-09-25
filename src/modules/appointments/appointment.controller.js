const service = require('./appointment.service');

// Adoptante solicita una cita
exports.create = async (req, res) => {
  res.status(201).json({ data: await service.create(req.user, req.valid.body) });
};

// Lista las citas vinculadas al usuario (como adoptante o como dueño de la mascota)
exports.list = async (req, res) => {
  res.json({ data: await service.list(req.user, req.valid.query) });
};

// Detalle de una cita (usado por la pantalla de seguimiento)
exports.getById = async (req, res) => {
  res.json({ data: await service.getById(req.user, req.params.id) });
};

// Cambia el estado de la cita, validado por la máquina de estados del service
exports.updateStatus = async (req, res) => {
  res.json({ data: await service.updateStatus(req.user, req.params.id, req.valid.body.status) });
};