const logger = require('../config/logger');

// Registra una acción del panel admin. Nunca rompe la acción principal: si falla, solo queda en el log.
// actor = req.user; target = { type, id }
exports.audit = async (actor, action, target = {}, details = null, transaction = undefined) => {
  try {
    const { AuditLog } = require('../models');
    await AuditLog.create({
      actorId: actor?.id ?? null, action, targetType: target.type ?? null, targetId: target.id ?? null, details,
    }, { transaction });
  } catch (err) {
    logger.warn({ err, action }, 'No se pudo registrar la auditoría');
  }
};
