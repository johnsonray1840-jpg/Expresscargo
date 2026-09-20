const { Shipment, ShipmentEvent, AuditLog } = require('../models');
const { sendShipmentStatusAlert } = require('../services/emailService');
const { broadcastShipmentUpdate } = require('../config/socket');
const { calculateServerProgress } = require('../utils/timeCalculator');
const logger = require('../utils/logger');
const { z } = require('zod');

const confiscateSchema = z.object({
  reason: z.string().min(5, 'A clear reason (at least 5 characters) is required for confiscation.'),
  confiscatingAuthority: z.string().optional().default('Border Customs & Regulatory Enforcement'),
  locationName: z.string().optional(),
  customerVisible: z.boolean().optional().default(true)
});

const unconfiscateSchema = z.object({
  notes: z.string().optional().default('Confiscation order lifted following customs/security clearance.'),
  resumeStatus: z.enum(['in_transit', 'customs_clearance', 'processing', 'at_facility']).default('in_transit'),
  customerVisible: z.boolean().optional().default(true)
});

/**
 * @desc Mark shipment as Confiscated (Admin / Super Admin only)
 * DOES NOT DELETE any records; preserves complete history and audit logs.
 * @route POST /api/shipments/:id/confiscate
 */
const confiscateShipment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, confiscatingAuthority, locationName, customerVisible } = confiscateSchema.parse(req.body);

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }

    if (shipment.status === 'confiscated') {
      return res.status(400).json({ success: false, error: 'Shipment is already marked as confiscated.' });
    }

    const previousStatus = shipment.status;
    const confiscationTime = new Date();

    // Snapshot exact progress before freezing
    const exactProgress = calculateServerProgress(shipment);

    // 1. Update Shipment record while strictly PRESERVING all historical data
    shipment.status = 'confiscated';
    shipment.progressPercentage = exactProgress;
    shipment.statusReason = reason;
    shipment.confiscationDetails = {
      isConfiscated: true,
      confiscatedAt: confiscationTime,
      confiscationReason: reason,
      confiscatedBy: req.user._id,
      confiscatingAuthority: confiscatingAuthority || 'Border Customs & Regulatory Enforcement',
      releasedAt: null,
      releasedBy: null
    };

    // Halt simulation if active
    if (shipment.simulationConfig) {
      shipment.simulationConfig.autoProgress = false;
    }

    await shipment.save();

    const eventLocation = locationName || shipment.currentCoordinates.city || shipment.origin.city;

    // 2. Create immutable ShipmentEvent (Historical audit preserved)
    const event = await ShipmentEvent.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      eventType: 'CONFISCATED',
      previousStatus,
      newStatus: 'confiscated',
      title: 'Shipment Confiscated',
      description: `Shipment seized/confiscated by ${confiscatingAuthority}. Reason: ${reason}`,
      locationName: eventLocation,
      coordinates: shipment.currentCoordinates,
      timestamp: confiscationTime,
      actor: req.user._id,
      actorRole: req.user.role,
      isPublic: customerVisible,
      customerVisible,
      metadata: {
        confiscatedAt: confiscationTime,
        reason,
        authority: confiscatingAuthority,
        authorizedBy: req.user.email
      }
    });

    // 3. Create Audit Log
    AuditLog.create({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'SHIPMENT_CONFISCATED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: {
        previousStatus,
        newStatus: 'confiscated',
        reason,
        authority: confiscatingAuthority,
        authorizedBy: req.user.email
      }
    }).catch(() => {});

    // 4. Send Real-Time Socket.IO Alert
    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:status_changed', {
      trackingNumber: shipment.trackingNumber,
      previousStatus,
      newStatus: 'confiscated',
      statusTitle: 'Shipment Confiscated',
      description: reason,
      color: '#dc2626',
      progressPercentage: shipment.progressPercentage,
      currentLocation: shipment.currentCoordinates,
      isConfiscated: true,
      event
    });

    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:confiscated', {
      trackingNumber: shipment.trackingNumber,
      confiscatedAt: confiscationTime,
      reason,
      authority: confiscatingAuthority
    });

    // 5. Send High-Priority Customer Email Notice
    sendShipmentStatusAlert(
      shipment,
      'CRITICAL: Official Consignment Confiscation Notice',
      `This is an official notification from Express Cargo Dispatch & Logistics Control regarding Consignment ${shipment.trackingNumber}. We regret to inform you that your shipment has been intercepted and confiscated by ${confiscatingAuthority}. <br><br><strong>Stated Reason for Seizure:</strong> ${reason}.<br><br>As a result, all active transit operations for this consignment have been indefinitely halted. The physical parcel is currently secured under the strict jurisdiction of the confiscating authority. To appeal this action, submit clearance documents, or request further legal information, please contact our regulatory support division immediately.`
    ).catch((err) => logger.warn('Failed to send confiscation email:', err.message));

    res.status(200).json({
      success: true,
      message: `Shipment ${shipment.trackingNumber} has been marked as confiscated. All history has been preserved.`,
      data: {
        trackingNumber: shipment.trackingNumber,
        status: shipment.status,
        confiscationDetails: shipment.confiscationDetails,
        event
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Release / Unconfiscate a shipment (Admin / Super Admin only)
 * @route POST /api/shipments/:id/unconfiscate
 */
const unconfiscateShipment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes, resumeStatus, customerVisible } = unconfiscateSchema.parse(req.body);

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }

    if (shipment.status !== 'confiscated' && (!shipment.confiscationDetails || !shipment.confiscationDetails.isConfiscated)) {
      return res.status(400).json({ success: false, error: 'Shipment is not currently confiscated.' });
    }

    const releaseTime = new Date();

    const confiscatedAtTime = shipment.confiscationDetails && shipment.confiscationDetails.confiscatedAt
      ? new Date(shipment.confiscationDetails.confiscatedAt).getTime()
      : shipment.updatedAt.getTime();
    const durationMs = Math.max(0, releaseTime.getTime() - confiscatedAtTime);

    if (!shipment.pauseDetails) {
      shipment.pauseDetails = { totalPausedDurationMs: 0 };
    }
    shipment.pauseDetails.totalPausedDurationMs = (shipment.pauseDetails.totalPausedDurationMs || 0) + durationMs;

    // 1. Update Shipment record
    shipment.status = resumeStatus;
    shipment.statusReason = notes;
    shipment.confiscationDetails = {
      isConfiscated: false,
      confiscatedAt: shipment.confiscationDetails ? shipment.confiscationDetails.confiscatedAt : null,
      confiscationReason: shipment.confiscationDetails ? shipment.confiscationDetails.confiscationReason : '',
      confiscatedBy: shipment.confiscationDetails ? shipment.confiscationDetails.confiscatedBy : null,
      confiscatingAuthority: shipment.confiscationDetails ? shipment.confiscationDetails.confiscatingAuthority : '',
      releasedAt: releaseTime,
      releasedBy: req.user._id
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
      previousStatus: 'confiscated',
      newStatus: resumeStatus,
      title: 'Confiscation Order Rescinded - Transit Restored',
      description: notes,
      locationName: shipment.currentCoordinates.city || shipment.origin.city,
      coordinates: shipment.currentCoordinates,
      timestamp: releaseTime,
      actor: req.user._id,
      actorRole: req.user.role,
      isPublic: customerVisible,
      customerVisible,
      metadata: { releasedAt: releaseTime, releasedBy: req.user.email }
    });

    // 3. Create Audit Log
    AuditLog.create({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'SHIPMENT_UNCONFISCATED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      details: { notes, resumeStatus, releasedBy: req.user.email }
    }).catch(() => {});

    // 4. Socket.IO Broadcast
    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:status_changed', {
      trackingNumber: shipment.trackingNumber,
      previousStatus: 'confiscated',
      newStatus: resumeStatus,
      statusTitle: 'Transit Restored',
      description: notes,
      color: '#2563eb',
      progressPercentage: shipment.progressPercentage,
      currentLocation: shipment.currentCoordinates,
      isConfiscated: false,
      event
    });

    // 5. Send Email Alert
    sendShipmentStatusAlert(
      shipment,
      'RESOLUTION: Consignment Confiscation Rescinded',
      `This is an official notification that the confiscation order previously placed on Consignment ${shipment.trackingNumber} has been formally reviewed and successfully resolved. <br><br>The regulatory hold has been fully cleared, and the physical parcel has been safely transferred back into our logistics network. The consignment has now resumed its active transit route towards the destination port.`
    ).catch((err) => logger.warn('Failed to send unconfiscate email:', err.message));

    res.status(200).json({
      success: true,
      message: `Confiscation order on shipment ${shipment.trackingNumber} has been resolved.`,
      data: {
        trackingNumber: shipment.trackingNumber,
        status: shipment.status,
        confiscationDetails: shipment.confiscationDetails,
        event
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  confiscateShipment,
  unconfiscateShipment
};

