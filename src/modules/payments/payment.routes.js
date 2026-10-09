const router = require('express').Router();
const service = require('./payment.service');

// Webhook de Wompi (configurar en el panel de Wompi → Desarrolladores → URL de eventos):
//   https://api.puppymarketcol.com/api/v1/payments/webhooks/wompi
// Público pero firmado: sin una firma válida responde 401. Siempre 200 si se procesó, para que Wompi no reintente.
router.post('/webhooks/wompi', async (req, res) => {
  res.json({ data: await service.handleWebhook(req.body) });
});

module.exports = router;
