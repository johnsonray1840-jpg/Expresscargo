const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getDashboardStats,
  getRecentShipments,
  getDashboardOverview
} = require('../controllers/adminDashboardController');
const {
  getAuditLogs,
  getAuditLogById,
  getAuditLogMetadata
} = require('../controllers/auditLogController');

// All admin routes require authenticated admin/staff privileges
router.use(protect);
router.use(authorize('admin', 'super_admin', 'staff'));

// Dashboard Endpoints
router.get('/dashboard/stats', getDashboardStats);
router.get('/dashboard/recent-shipments', getRecentShipments);
router.get('/dashboard/overview', getDashboardOverview);

// Audit Logs Endpoints
router.get('/audit-logs', getAuditLogs);
router.get('/audit-logs/metadata', getAuditLogMetadata);
router.get('/audit-logs/:id', getAuditLogById);

module.exports = router;
