const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification
} = require('../controllers/notificationController');

// All notification routes require authenticated user
router.use(protect);

router.route('/')
  .get(getNotifications);

router.patch('/read-all', markAllNotificationsRead);

router.route('/:id/read')
  .patch(markNotificationRead);

router.route('/:id')
  .delete(deleteNotification);

module.exports = router;

