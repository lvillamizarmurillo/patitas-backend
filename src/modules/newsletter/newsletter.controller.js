const service = require('./newsletter.service');

exports.subscribe = async (req, res) => {
  await service.subscribe(req.valid.body);
  res.json({ data: { message: '¡Listo! Te suscribiste a nuestro boletín.' } });
};

exports.unsubscribe = async (req, res) => {
  await service.unsubscribe(req.valid.body);
  res.json({ data: { message: 'Te diste de baja del boletín.' } });
};
