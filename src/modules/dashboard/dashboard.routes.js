const router = require('express').Router();
const { authMiddleware, requireRole } = require('../../middlewares/auth.middleware');
const service = require('./dashboard.service');

router.get('/', authMiddleware, requireRole('shelter', 'breeder'),
  async (req, res) => res.json({ data: await service.getOwnerDashboard(req.user.id) }));

module.exports = router;