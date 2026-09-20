const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * Record a standardized audit log entry
 * @param {object} param0
 */
const recordAuditLog = async ({
  req = null,
  admin = null,
  action,
  resource = 'Shipment',
  resourceId = '',
  previousValue = null,
  newValue = null,
  reason = '',
  details = {},
  ipAddress = '',
  userAgent = ''
}) => {
  try {
    let resolvedAdmin = admin;
    let resolvedAdminEmail = '';
    let resolvedAdminName = '';
    let resolvedIp = ipAddress;
    let resolvedAgent = userAgent;

    if (req) {
      if (req.user) {
        resolvedAdmin = req.user._id || req.user.id;
        resolvedAdminEmail = req.user.email || '';
        resolvedAdminName = req.user.name || '';
      }
      if (!resolvedIp) {
        resolvedIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
      }
      if (!resolvedAgent) {
        resolvedAgent = req.headers['user-agent'] || '';
      }
    }

    const logEntry = await AuditLog.create({
      admin: resolvedAdmin,
      user: resolvedAdmin,
      adminEmail: resolvedAdminEmail,
      adminName: resolvedAdminName,
      action: action.toUpperCase(),
      resource,
      targetType: resource,
      resourceId: resourceId ? resourceId.toString() : '',
      targetId: resourceId ? resourceId.toString() : '',
      previousValue,
      newValue,
      reason,
      details,
      ipAddress: resolvedIp,
      userAgent: resolvedAgent,
      timestamp: new Date()
    });

    return logEntry;
  } catch (error) {
    logger.warn(`Failed to record audit log for action "${action}":`, error.message);
    return null;
  }
};

module.exports = {
  recordAuditLog
};

