const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getEmailSettings,
  updateEmailSettings,
  testEmailSettings,
  getEmailLogs,
  retryEmailLog
} = require('../controllers/emailSettingController');

// All setting routes require authentication and admin role
router.use(protect);
router.use(authorize('admin', 'super_admin'));

// Email & SMTP Configuration Routes
router.route('/email')
  .get(getEmailSettings)
  .put(updateEmailSettings);

router.post('/email/test', testEmailSettings);

// Email Delivery & Audit Logs
router.get('/emails/logs', getEmailLogs);
router.post('/emails/logs/:id/retry', retryEmailLog);

module.exports = router;
