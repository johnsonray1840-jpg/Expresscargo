const { Shipment, ShipmentEvent, AuditLog } = require('../models');
const { sendShipmentStatusAlert } = require('../services/emailService');
const { broadcastShipmentUpdate } = require('../config/socket');
const { calculateServerProgress } = require('../utils/timeCalculator');
const logger = require('../utils/logger');
const { z } = require('zod');

const suspendSchema = z.object({
  reason: z.string().min(5, 'A clear reason (at least 5 characters) is required for suspension.'),
  locationName: z.string().optional(),
  customerVisible: z.boolean().optional().default(true)
});

const unsuspendSchema = z.object({
  notes: z.string().optional().default('Suspension lifted by administrator. Transit cleared to resume.'),
  resumeStatus: z.enum(['in_transit', 'processing', 'at_facility', 'awaiting_pickup']).default('in_transit'),
  customerVisible: z.boolean().optional().default(true)
});

/**
 * @desc Suspend a shipment (Admin / Super Admin only)
 * @route POST /api/shipments/:id/suspend
 */
const suspendShipment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, locationName, customerVisible } = suspendSchema.parse(req.body);

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }

    if (shipment.status === 'suspended') {
      return res.status(400).json({ success: false, error: 'Shipment is already suspended.' });
    }

    const previousStatus = shipment.status;
    const suspendTime = new Date();

    // Snapshot exact progress before freezing
    const exactProgress = calculateServerProgress(shipment);

    // 1. Update Shipment record & freeze progress
    shipment.status = 'suspended';
    shipment.progressPercentage = exactProgress;
    shipment.statusReason = reason;
    shipment.suspensionDetails = {
      isSuspended: true,
      suspendedAt: suspendTime,
      suspensionReason: reason,
      suspendedBy: req.user._id,
      unsuspendedAt: null,
      unsuspendedBy: null
    };

    // Halt simulation if active
    if (shipment.simulationConfig) {
      shipment.simulationConfig.autoProgress = false;
    }

    await shipment.save();

    const eventLocation = locationName || shipment.currentCoordinates.city || shipment.origin.city;

    // 2. Create immutable ShipmentEvent
    const event = await ShipmentEvent.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      eventType: 'SUSPENDED',
      previousStatus,
      newStatus: 'suspended',
      title: 'Shipment Suspended',
      description: `Shipment suspended: ${reason}`,
      locationName: eventLocation,
      coordinates: shipment.currentCoordinates,
      timestamp: suspendTime,
      actor: req.user._id,
      actorRole: req.user.role,
      isPublic: customerVisible,
      customerVisible,
      metadata: { suspendedAt: suspendTime, reason, suspendedBy: req.user.email }
    });

    // 3. Create Audit Log
    AuditLog.create({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'SHIPMENT_SUSPENDED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: {
        previousStatus,
        newStatus: 'suspended',
        reason,
        suspendedBy: req.user.email
      }
    }).catch(() => {});

    // 4. Send Real-Time Socket.IO Alert to Map and Admin Feed
    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:status_changed', {
      trackingNumber: shipment.trackingNumber,
      previousStatus,
      newStatus: 'suspended',
      statusTitle: 'Shipment Suspended',
      description: reason,
      color: '#dc2626',
      progressPercentage: shipment.progressPercentage,
      currentLocation: shipment.currentCoordinates,
      isSuspended: true,
      event
    });

    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:suspended', {
      trackingNumber: shipment.trackingNumber,
      suspendedAt: suspendTime,
      reason
    });

    // 5. Send High-Priority Customer Email Notification
    sendShipmentStatusAlert(
      shipment,
      'ATTENTION: Consignment Transit Suspended',
      `This is an official administrative notice regarding Consignment ${shipment.trackingNumber}. We wish to inform you that all transit operations for your shipment have been formally suspended.<br><br><strong>Recorded Reason for Suspension:</strong> ${reason}.<br><br>The physical parcel is currently secure at our logistics facility while this matter is under review. Please contact your dedicated customer support representative or our dispatch control center immediately to resolve this status and authorize further movement.`
    ).catch((err) => logger.warn('Failed to send suspension email:', err.message));

    res.status(200).json({
      success: true,
      message: `Shipment ${shipment.trackingNumber} has been successfully suspended.`,
      data: {
        trackingNumber: shipment.trackingNumber,
        status: shipment.status,
        suspensionDetails: shipment.suspensionDetails,
        event
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Lift suspension and resume shipment (Admin / Super Admin only)
 * @route POST /api/shipments/:id/unsuspend
 */
const unsuspendShipment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes, resumeStatus, customerVisible } = unsuspendSchema.parse(req.body);

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }

    if (shipment.status !== 'suspended' && (!shipment.suspensionDetails || !shipment.suspensionDetails.isSuspended)) {
      return res.status(400).json({ success: false, error: 'Shipment is not currently suspended.' });
    }

    const unspendTime = new Date();

    const suspendedAtTime = shipment.suspensionDetails && shipment.suspensionDetails.suspendedAt
      ? new Date(shipment.suspensionDetails.suspendedAt).getTime()
      : shipment.updatedAt.getTime();
    const durationMs = Math.max(0, unspendTime.getTime() - suspendedAtTime);

    if (!shipment.pauseDetails) {
      shipment.pauseDetails = { totalPausedDurationMs: 0 };
    }
    shipment.pauseDetails.totalPausedDurationMs = (shipment.pauseDetails.totalPausedDurationMs || 0) + durationMs;

    // 1. Update Shipment record
    shipment.status = resumeStatus;
    shipment.statusReason = notes;
    shipment.suspensionDetails = {
      isSuspended: false,
      suspendedAt: shipment.suspensionDetails ? shipment.suspensionDetails.suspendedAt : null,
      suspensionReason: '',
      suspendedBy: shipment.suspensionDetails ? shipment.suspensionDetails.suspendedBy : null,
      unsuspendedAt: unspendTime,
      unsuspendedBy: req.user._id
    };

    if (shipment.simulationConfig && shipment.simulationConfig.isSimulated) {
      shipment.simulationConfig.autoProgress = true;
    }

    await shipment.save();

    // 2. Create immutable ShipmentEvent
    const event = await ShipmentEvent.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      eventType: 'RESUMED',
      previousStatus: 'suspended',
      newStatus: resumeStatus,
      title: 'Suspension Cleared - Transit Resumed',
      description: notes,
      locationName: shipment.currentCoordinates.city || shipment.origin.city,
      coordinates: shipment.currentCoordinates,
      timestamp: unspendTime,
      actor: req.user._id,
      actorRole: req.user.role,
      isPublic: customerVisible,
      customerVisible,
      metadata: { unsuspendedAt: unspendTime, clearedBy: req.user.email }
    });

    // 3. Create Audit Log
    AuditLog.create({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'SHIPMENT_UNSUSPENDED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      details: { notes, resumeStatus, clearedBy: req.user.email }
    }).catch(() => {});

    // 4. Socket.IO Broadcast
    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:status_changed', {
      trackingNumber: shipment.trackingNumber,
      previousStatus: 'suspended',
      newStatus: resumeStatus,
      statusTitle: 'Transit Cleared',
      description: notes,
      color: '#2563eb',
      progressPercentage: shipment.progressPercentage,
      currentLocation: shipment.currentCoordinates,
      isSuspended: false,
      event
    });

    // 5. Send Email Alert
    sendShipmentStatusAlert(
      shipment,
      'RESOLUTION: Consignment Suspension Cleared',
      `This is an official notification that the transit suspension previously placed on Consignment ${shipment.trackingNumber} has been fully resolved.<br><br>All administrative blocks have been cleared from our system. The parcel has been safely returned to our active dispatch queue and has officially resumed its scheduled transit corridor towards the destination port.`
    ).catch((err) => logger.warn('Failed to send unsuspend email:', err.message));

    res.status(200).json({
      success: true,
      message: `Suspension on shipment ${shipment.trackingNumber} has been lifted.`,
      data: {
        trackingNumber: shipment.trackingNumber,
        status: shipment.status,
        suspensionDetails: shipment.suspensionDetails,
        event
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  suspendShipment,
  unsuspendShipment
};

