const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendRealTimeNotification } = require('../config/socket');
const logger = require('../utils/logger');

/**
 * Create and dispatch a customer notification
 */
const createCustomerNotification = async ({
  userId,
  shipmentId = null,
  trackingNumber = '',
  type = 'STATUS_CHANGE',
  title,
  message,
  metadata = {}
}) => {
  try {
    if (!userId) {
      logger.debug('Notification skipped: No user ID supplied');
      return null;
    }

    const notification = await Notification.create({
      user: userId,
      recipient: userId,
      shipment: shipmentId,
      trackingNumber,
      type,
      title,
      message,
      metadata,
      read: false
    });

    // Real-time dispatch via Socket.IO
    sendRealTimeNotification(userId, notification);
    logger.info(`Notification created for user ${userId}: "${title}"`);

    return notification;
  } catch (error) {
    logger.error('Failed to create customer notification:', error.message);
    return null;
  }
};

/**
 * Automatically notify all registered customer stakeholders associated with a shipment
 */
const notifyShipmentStakeholders = async (shipment, title, message, type = 'STATUS_CHANGE', metadata = {}) => {
  try {
    const userIdsToNotify = new Set();

    // 1. Direct customer reference on shipment
    if (shipment.customer) {
      userIdsToNotify.add(shipment.customer.toString());
    }

    // 2. Lookup registered users matching sender / recipient email
    const emailsToLookup = [];
    if (shipment.sender && shipment.sender.email) emailsToLookup.push(shipment.sender.email.toLowerCase());
    if (shipment.recipient && shipment.recipient.email) emailsToLookup.push(shipment.recipient.email.toLowerCase());

    if (emailsToLookup.length > 0) {
      const users = await User.find({ email: { $in: emailsToLookup } }).select('_id').lean();
      users.forEach(u => userIdsToNotify.add(u._id.toString()));
    }

    // Create and dispatch real-time notifications for each stakeholder
    const notifications = [];
    for (const uId of userIdsToNotify) {
      const notif = await createCustomerNotification({
        userId: uId,
        shipmentId: shipment._id,
        trackingNumber: shipment.trackingNumber,
        type,
        title,
        message,
        metadata
      });
      if (notif) notifications.push(notif);
    }

    return notifications;
  } catch (err) {
    logger.warn('Error in notifyShipmentStakeholders:', err.message);
    return [];
  }
};

module.exports = {
  createCustomerNotification,
  notifyShipmentStakeholders
};

