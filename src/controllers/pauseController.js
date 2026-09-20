const { Shipment, ShipmentEvent, AuditLog } = require('../models');
const { sendShipmentStatusAlert } = require('../services/emailService');
const { broadcastShipmentUpdate } = require('../config/socket');
const { calculateServerProgress } = require('../utils/timeCalculator');
const logger = require('../utils/logger');
const { z } = require('zod');

const pauseSchema = z.object({
  reason: z.string().optional().default('Transit temporarily paused by logistics controller.'),
  locationName: z.string().optional(),
  customerVisible: z.boolean().optional().default(true)
});

const resumeSchema = z.object({
  notes: z.string().optional().default('Shipment transit resumed.'),
  adjustETA: z.boolean().optional().default(true),
  customerVisible: z.boolean().optional().default(true)
});

/**
 * @desc Pause a shipment (Admin/Staff only)
 * @route POST /api/shipments/:id/pause
 */
const pauseShipment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = pauseSchema.parse(req.body);

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }

    if (shipment.status === 'paused') {
      return res.status(400).json({ success: false, error: 'Shipment is already paused.' });
    }

    const previousStatus = shipment.status;
    const pauseTime = new Date();

    // Snapshot exact progress before freezing
    const exactProgress = calculateServerProgress(shipment);

    // 1. Update Shipment record & freeze progress
    shipment.status = 'paused';
    shipment.progressPercentage = exactProgress;
    shipment.statusReason = validatedData.reason;
    shipment.pauseDetails = {
      isPaused: true,
      pausedAt: pauseTime,
      resumedAt: null,
      pauseReason: validatedData.reason,
      previousStatusBeforePause: previousStatus,
      totalPausedDurationMs: shipment.pauseDetails ? shipment.pauseDetails.totalPausedDurationMs || 0 : 0
    };

    shipment.status = 'paused';
    shipment.statusReason = validatedData.reason;

    // Stop simulation movement if active
    if (shipment.simulationConfig) {
      shipment.simulationConfig.autoProgress = false;
    }

    await shipment.save();

    const locationName = validatedData.locationName || shipment.currentCoordinates.city || shipment.origin.city;

    // 2. Create immutable ShipmentEvent (Never lose tracking history)
    const event = await ShipmentEvent.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      eventType: 'PAUSED',
      previousStatus,
      newStatus: 'paused',
      title: 'Transit Paused',
      description: validatedData.reason,
      locationName,
      coordinates: shipment.currentCoordinates,
      timestamp: pauseTime,
      actor: req.user._id,
      actorRole: req.user.role,
      isPublic: validatedData.customerVisible,
      customerVisible: validatedData.customerVisible,
      metadata: { pausedAt: pauseTime, reason: validatedData.reason }
    });

    // 3. Audit Log
    AuditLog.create({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'SHIPMENT_PAUSED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      details: { previousStatus, reason: validatedData.reason }
    }).catch(() => {});

    // 4. Send Real-Time Socket.IO Alert
    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:status_changed', {
      trackingNumber: shipment.trackingNumber,
      previousStatus,
      newStatus: 'paused',
      statusTitle: 'Transit Paused',
      description: validatedData.reason,
      color: '#d97706',
      progressPercentage: shipment.progressPercentage,
      currentLocation: shipment.currentCoordinates,
      isPaused: true,
      event
    });

    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:paused', {
      trackingNumber: shipment.trackingNumber,
      pausedAt: pauseTime,
      reason: validatedData.reason
    });

    // 5. Send Email Alert
    sendShipmentStatusAlert(
      shipment,
      'ATTENTION: Transit Hold Placed on Consignment',
      `This is an administrative notification regarding Consignment ${shipment.trackingNumber}. Please be advised that active transit operations for your shipment have been temporarily suspended and the parcel has been placed on an operational hold at its current location. <br><br><strong>Recorded Reason for Hold:</strong> ${validatedData.reason}.<br><br>Our logistics coordinators are currently reviewing the situation to ensure compliance and safe routing. The consignment remains secure in our facility, and you will be notified the moment the hold is lifted and transit resumes.`
    ).catch((err) => logger.warn('Failed to send pause email:', err.message));

    res.status(200).json({
      success: true,
      message: `Shipment ${shipment.trackingNumber} has been paused.`,
      data: {
        trackingNumber: shipment.trackingNumber,
        status: shipment.status,
        pauseDetails: shipment.pauseDetails,
        event
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Resume a paused shipment (Admin/Staff only)
 * @route POST /api/shipments/:id/resume
 */
const resumeShipment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = resumeSchema.parse(req.body);

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }

    if (shipment.status !== 'paused' && (!shipment.pauseDetails || !shipment.pauseDetails.isPaused)) {
      return res.status(400).json({ success: false, error: 'Shipment is not currently paused.' });
    }

    const resumeTime = new Date();
    const pausedAtTime = shipment.pauseDetails && shipment.pauseDetails.pausedAt
      ? new Date(shipment.pauseDetails.pausedAt).getTime()
      : shipment.updatedAt.getTime();

    const durationMs = Math.max(0, resumeTime.getTime() - pausedAtTime);
    const durationMinutes = Math.round(durationMs / 60000);

    // 1. Calculate and update ETA if requested
    if (validatedData.adjustETA && shipment.estimatedDeliveryDate) {
      shipment.estimatedDeliveryDate = new Date(shipment.estimatedDeliveryDate.getTime() + durationMs);
    }

    // 2. Append to pause history
    shipment.pauseHistory.push({
      pausedAt: shipment.pauseDetails.pausedAt || new Date(pausedAtTime),
      resumedAt: resumeTime,
      durationMs,
      reason: shipment.pauseDetails.pauseReason || '',
      pausedBy: shipment.pauseDetails.pausedBy || req.user._id,
      resumedBy: req.user._id
    });

    // 3. Restore status
    const targetStatus = shipment.pauseDetails.previousStatusBeforePause && shipment.pauseDetails.previousStatusBeforePause !== 'paused'
      ? shipment.pauseDetails.previousStatusBeforePause
      : 'in_transit';

    shipment.status = targetStatus;
    shipment.statusReason = validatedData.notes || 'Transit resumed.';

    shipment.pauseDetails = {
      isPaused: false,
      pausedAt: shipment.pauseDetails.pausedAt,
      resumedAt: resumeTime,
      pauseReason: '',
      previousStatusBeforePause: targetStatus,
      totalPausedDurationMs: (shipment.pauseDetails.totalPausedDurationMs || 0) + durationMs
    };

    // Resume simulation if active
    if (shipment.simulationConfig && shipment.simulationConfig.isSimulated) {
      shipment.simulationConfig.autoProgress = true;
    }

    await shipment.save();

    const desc = `${validatedData.notes} (Paused for ${durationMinutes > 60 ? `${(durationMinutes / 60).toFixed(1)} hrs` : `${durationMinutes} mins`}). Revised Estimated Delivery: ${shipment.estimatedDeliveryDate ? shipment.estimatedDeliveryDate.toLocaleDateString() : 'Unchanged'}.`;

    // 4. Create immutable ShipmentEvent
    const event = await ShipmentEvent.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      eventType: 'RESUMED',
      previousStatus: 'paused',
      newStatus: targetStatus,
      title: 'Transit Resumed',
      description: desc,
      locationName: shipment.currentCoordinates.city || shipment.origin.city,
      coordinates: shipment.currentCoordinates,
      timestamp: resumeTime,
      actor: req.user._id,
      actorRole: req.user.role,
      isPublic: validatedData.customerVisible,
      customerVisible: validatedData.customerVisible,
      metadata: { resumedAt: resumeTime, durationMinutes, updatedETA: shipment.estimatedDeliveryDate }
    });

    // 5. Audit Log
    AuditLog.create({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'SHIPMENT_RESUMED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      details: { resumedToStatus: targetStatus, durationMinutes, newETA: shipment.estimatedDeliveryDate }
    }).catch(() => {});

    // 6. Broadcast Real-Time Socket.IO event
    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:status_changed', {
      trackingNumber: shipment.trackingNumber,
      previousStatus: 'paused',
      newStatus: targetStatus,
      statusTitle: 'Transit Resumed',
      description: desc,
      color: '#2563eb',
      progressPercentage: shipment.progressPercentage,
      currentLocation: shipment.currentCoordinates,
      isPaused: false,
      estimatedDeliveryDate: shipment.estimatedDeliveryDate,
      event
    });

    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:resumed', {
      trackingNumber: shipment.trackingNumber,
      resumedAt: resumeTime,
      durationMinutes,
      status: targetStatus
    });

    // 7. Send Email Alert
    sendShipmentStatusAlert(
      shipment,
      'UPDATE: Transit Hold Lifted - Operations Resumed',
      `We are pleased to inform you that the operational hold on Consignment ${shipment.trackingNumber} has been officially lifted. <br><br>The parcel has been verified, cleared for dispatch, and is currently moving along its designated flight corridor. No further action is required from your end.<br><br><strong>Revised Estimated Delivery Date:</strong> ${shipment.estimatedDeliveryDate ? shipment.estimatedDeliveryDate.toLocaleDateString() : 'On Schedule'}.`
    ).catch((err) => logger.warn('Failed to send resume email:', err.message));

    res.status(200).json({
      success: true,
      message: `Shipment ${shipment.trackingNumber} transit successfully resumed.`,
      data: {
        trackingNumber: shipment.trackingNumber,
        status: shipment.status,
        durationMinutes,
        estimatedDeliveryDate: shipment.estimatedDeliveryDate,
        pauseDetails: shipment.pauseDetails,
        event
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  pauseShipment,
  resumeShipment
};

