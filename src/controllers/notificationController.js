const Notification = require('../models/Notification');
const logger = require('../utils/logger');

/**
 * @desc    Get Current User's Notifications
 * @route   GET /api/notifications
 * @access  Private
 */
const getNotifications = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const skip = (page - 1) * limit;

    const filter = {
      $or: [
        { user: req.user._id },
        { recipient: req.user._id }
      ]
    };

    if (req.query.read !== undefined) {
      filter.read = req.query.read === 'true';
    }

    if (req.query.type) {
      filter.type = req.query.type;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .populate('shipment', 'trackingNumber status origin destination currentCheckpoint')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({
        $or: [
          { user: req.user._id },
          { recipient: req.user._id }
        ],
        read: false
      })
    ]);

    return res.status(200).json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Failed to get notifications:', error);
    next(error);
  }
};

/**
 * @desc    Mark a Single Notification as Read
 * @route   PATCH /api/notifications/:id/read
 * @access  Private
 */
const markNotificationRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      $or: [
        { user: req.user._id },
        { recipient: req.user._id }
      ]
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    notification.read = true;
    await notification.save();

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    logger.error('Failed to mark notification read:', error);
    next(error);
  }
};

/**
 * @desc    Mark All User Notifications as Read
 * @route   PATCH /api/notifications/read-all
 * @access  Private
 */
const markAllNotificationsRead = async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      {
        $or: [
          { user: req.user._id },
          { recipient: req.user._id }
        ],
        read: false
      },
      {
        $set: { read: true }
      }
    );

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    logger.error('Failed to mark all notifications read:', error);
    next(error);
  }
};

/**
 * @desc    Delete a Notification
 * @route   DELETE /api/notifications/:id
 * @access  Private
 */
const deleteNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      $or: [
        { user: req.user._id },
        { recipient: req.user._id }
      ]
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    logger.error('Failed to delete notification:', error);
    next(error);
  }
};

module.exports = {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification
};

