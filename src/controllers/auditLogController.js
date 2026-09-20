const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * @desc    Get Paginated & Filterable Audit Logs
 * @route   GET /api/admin/audit-logs
 * @access  Private/Admin
 */
const getAuditLogs = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.action) {
      filter.action = req.query.action.toUpperCase();
    }
    if (req.query.resource) {
      filter.resource = req.query.resource;
    }
    if (req.query.resourceId) {
      filter.$or = [
        { resourceId: req.query.resourceId },
        { targetId: req.query.resourceId }
      ];
    }
    if (req.query.adminId) {
      filter.$or = [
        { admin: req.query.adminId },
        { user: req.query.adminId }
      ];
    }
    if (req.query.startDate || req.query.endDate) {
      filter.timestamp = {};
      if (req.query.startDate) filter.timestamp.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filter.timestamp.$lte = new Date(req.query.endDate);
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('admin', 'name email role')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Failed to get audit logs:', error);
    next(error);
  }
};

/**
 * @desc    Get Single Audit Log Entry
 * @route   GET /api/admin/audit-logs/:id
 * @access  Private/Admin
 */
const getAuditLogById = async (req, res, next) => {
  try {
    const log = await AuditLog.findById(req.params.id)
      .populate('admin', 'name email role phone')
      .lean();

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Audit log record not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: log
    });
  } catch (error) {
    logger.error('Failed to get audit log by ID:', error);
    next(error);
  }
};

/**
 * @desc    Get List of Distinct Actions & Resources Recorded
 * @route   GET /api/admin/audit-logs/metadata
 * @access  Private/Admin
 */
const getAuditLogMetadata = async (req, res, next) => {
  try {
    const [actions, resources] = await Promise.all([
      AuditLog.distinct('action'),
      AuditLog.distinct('resource')
    ]);

    return res.status(200).json({
      success: true,
      data: {
        actions: actions.sort(),
        resources: resources.sort()
      }
    });
  } catch (error) {
    logger.error('Failed to get audit metadata:', error);
    next(error);
  }
};

module.exports = {
  getAuditLogs,
  getAuditLogById,
  getAuditLogMetadata
};

