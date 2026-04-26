const { extractClientMeta } = require('../services/authTrackingService');
const { evaluateAccessRestriction } = require('../services/securityService');

async function ipBlockGuard(req, res, next) {
  try {
    const path = String(req.originalUrl || req.url || '');
    if (path === '/health') return next();

    const client = extractClientMeta(req);
    const accessCheck = await evaluateAccessRestriction(client);
    if (!accessCheck.blocked) return next();

    return res.status(403).json({
      message: 'Доступ ограничен правилами безопасности',
      reason: accessCheck.reason || 'blocked',
    });
  } catch (_error) {
    return next();
  }
}

module.exports = ipBlockGuard;
