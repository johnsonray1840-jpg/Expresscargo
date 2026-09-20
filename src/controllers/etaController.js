const { Shipment, ShipmentEvent, AuditLog } = require('../models');
const { calculateSystemETA, getEffectiveETA, calculateServerProgress } = require('../utils/timeCalculator');
const { broadcastShipmentUpdate } = require('../config/socket');
const logger = require('../utils/logger');
const { z } = require('zod');

const updateETASchema = z.object({
  adminETA: z.string().or(z.date()),
  reason: z.string().min(1, 'Reason for ETA adjustment is required.'),
  customerVisible: z.boolean().optional().default(true)
});

/**
 * @desc Manually set/override ETA (Admin only)
 * Strictly preserves previous ETA value in event history & etaHistory
 * @route PATCH /api/shipments/:id/eta
 */
const updateAdminETA = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { adminETA, reason, customerVisible } = updateETASchema.parse(req.body);

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }

    const previousETA = getEffectiveETA(shipment);
    const newETADate = new Date(adminETA);

    if (isNaN(newETADate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid ETA date format' });
    }

    // 1. Update Shipment adminETA & effective ETA
    shipment.adminETA = newETADate;
    shipment.systemETA = calculateSystemETA(shipment);
    shipment.expectedDeliveryAt = newETADate;
    shipment.estimatedDeliveryDate = newETADate;

    // 2. Append to etaHistory
    shipment.etaHistory.push({
      previousETA,
      newETA: newETADate,
      type: 'admin_override',
      reason,
      changedBy: req.user._id,
      timestamp: new Date()
    });

    // 3. Recalculate Server Progress
    shipment.progressPercentage = calculateServerProgress(shipment);
    await shipment.save();

    const formattedPrev = previousETA ? previousETA.toLocaleDateString() : 'None';
    const formattedNew = newETADate.toLocaleDateString();

    // 4. Create immutable ShipmentEvent (Historical Record)
    const event = await ShipmentEvent.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      eventType: 'CUSTOM',
      previousStatus: shipment.status,
      newStatus: shipment.status,
      title: 'Estimated Delivery Date Adjusted',
      description: `ETA revised from ${formattedPrev} to ${formattedNew}. Reason: ${reason}`,
      locationName: shipment.currentCoordinates.city || shipment.origin.city,
      coordinates: shipment.currentCoordinates,
      timestamp: new Date(),
      actor: req.user._id,
      actorRole: req.user.role,
      isPublic: customerVisible,
      customerVisible,
      metadata: { previousETA, newETA: newETADate, reason }
    });

    // 5. Audit Log
    AuditLog.create({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'ETA_MANUALLY_OVERRIDDEN',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      details: { previousETA, newETA: newETADate, reason }
    }).catch(() => {});

    // 6. Broadcast Real-Time Socket.IO update
    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:eta_updated', {
      trackingNumber: shipment.trackingNumber,
      expectedDeliveryAt: newETADate,
      adminETA: newETADate,
      systemETA: shipment.systemETA,
      progressPercentage: shipment.progressPercentage,
      reason,
      event
    });

    res.status(200).json({
      success: true,
      message: `ETA updated to ${formattedNew}. Previous value preserved in history.`,
      data: {
        trackingNumber: shipment.trackingNumber,
        previousETA,
        expectedDeliveryAt: shipment.expectedDeliveryAt,
        adminETA: shipment.adminETA,
        systemETA: shipment.systemETA,
        progressPercentage: shipment.progressPercentage,
        event
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Clear admin manual ETA override and restore system calculated ETA
 * @route DELETE /api/shipments/:id/eta/override
 */
const clearAdminETAOverride = async (req, res, next) => {
  try {
    const { id } = req.params;

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }

    const previousETA = shipment.adminETA;
    shipment.adminETA = null;
    shipment.systemETA = calculateSystemETA(shipment);
    shipment.expectedDeliveryAt = shipment.systemETA;
    shipment.estimatedDeliveryDate = shipment.systemETA;

    shipment.etaHistory.push({
      previousETA,
      newETA: shipment.systemETA,
      type: 'system',
      reason: 'Admin override removed; restored algorithmically calculated system ETA.',
      changedBy: req.user._id,
      timestamp: new Date()
    });

    shipment.progressPercentage = calculateServerProgress(shipment);
    await shipment.save();

    const event = await ShipmentEvent.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      eventType: 'CUSTOM',
      previousStatus: shipment.status,
      newStatus: shipment.status,
      title: 'Estimated Delivery Restored to Automatic System Schedule',
      description: `ETA restored to system calculated date: ${shipment.systemETA ? shipment.systemETA.toLocaleDateString() : 'N/A'}.`,
      locationName: shipment.currentCoordinates.city || shipment.origin.city,
      coordinates: shipment.currentCoordinates,
      timestamp: new Date(),
      actor: req.user._id,
      actorRole: req.user.role,
      isPublic: true,
      customerVisible: true
    });

    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:eta_updated', {
      trackingNumber: shipment.trackingNumber,
      expectedDeliveryAt: shipment.expectedDeliveryAt,
      adminETA: null,
      systemETA: shipment.systemETA,
      progressPercentage: shipment.progressPercentage,
      event
    });

    res.status(200).json({
      success: true,
      message: 'Admin ETA override cleared. Restored system calculated ETA.',
      data: {
        trackingNumber: shipment.trackingNumber,
        expectedDeliveryAt: shipment.expectedDeliveryAt,
        systemETA: shipment.systemETA
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get comprehensive ETA analysis & history breakdown
 * @route GET /api/shipments/:id/eta
 */
const getETABreakdown = async (req, res, next) => {
  try {
    const { id } = req.params;

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    }).populate('etaHistory.changedBy', 'name email role').lean();

    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }

    const systemETA = calculateSystemETA(shipment);
    const effectiveETA = getEffectiveETA(shipment);
    const startTime = new Date(shipment.startedAt || shipment.dispatchDate || shipment.createdAt);

    const now = Date.now();
    const totalDurationHours = effectiveETA ? ((effectiveETA.getTime() - startTime.getTime()) / 3600000).toFixed(1) : 0;
    const remainingHours = effectiveETA ? Math.max(0, ((effectiveETA.getTime() - now) / 3600000).toFixed(1)) : 0;

    res.status(200).json({
      success: true,
      data: {
        trackingNumber: shipment.trackingNumber,
        startedAt: shipment.startedAt,
        effectiveETA,
        adminETA: shipment.adminETA,
        systemETA,
        hasAdminOverride: !!shipment.adminETA,
        totalDurationHours: Number(totalDurationHours),
        remainingHours: Number(remainingHours),
        totalPausedDurationMinutes: Math.round((shipment.pauseDetails ? shipment.pauseDetails.totalPausedDurationMs || 0 : 0) / 60000),
        progressPercentage: shipment.progressPercentage,
        history: shipment.etaHistory || []
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  updateAdminETA,
  clearAdminETAOverride,
  getETABreakdown
};

