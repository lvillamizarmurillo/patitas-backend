const service = require('./pet.service');

// 1. LISTAR MASCOTAS (con filtros)
exports.list = async (req, res) => {
  res.json({ data: await service.list(req.valid.query) });
};

// 2. MIS MASCOTAS (del dueño autenticado)
exports.listMine = async (req, res) => {
  res.json({ data: await service.listMine(req.user, req.valid.query) });
};

// 3. DETALLE DE MASCOTA POR ID
exports.getById = async (req, res) => {
  res.json({ data: await service.getById(req.valid.params.id) });
};

// 4. CREAR MASCOTA
exports.create = async (req, res) => {
  res.status(201).json({ data: await service.create(req.user, req.valid.body, req.file) });
};

// 5. EDITAR MASCOTA (solo el dueño)
exports.update = async (req, res) => {
  res.json({ data: await service.update(req.user, req.params.id, req.valid.body, req.file) });
};

// 6. ELIMINAR MASCOTA (solo el dueño, y no si tiene una cita activa)
exports.remove = async (req, res) => {
  await service.remove(req.user, req.params.id);
  res.status(204).send();
};