const { Shipment, ShipmentEvent, AuditLog } = require('../models');
const { parseDurationConfig, calculateServerProgress } = require('../utils/timeCalculator');
const { broadcastShipmentUpdate } = require('../config/socket');
const logger = require('../utils/logger');
const { z } = require('zod');

const updateDurationSchema = z.object({
  preset: z
    .enum(['1h', '2h', '6h', '12h', '1d', '2d', '3d', '1w', '2w', '1m', 'custom', 'indefinite'])
    .optional(),
  value: z.number().min(0).optional(),
  unit: z.enum(['hours', 'days', 'weeks', 'months', 'indefinite']).optional(),
  isIndefinite: z.boolean().optional(),
  startedAt: z.string().or(z.date()).optional(),
  notes: z.string().optional()
});

/**
 * @desc Update shipment transit duration (from 1 hour to infinite) & recalculate ETA
 * @route PATCH /api/shipments/:id/duration
 */
const updateShipmentDuration = async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = updateDurationSchema.parse(req.body);

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }

    const previousDuration = shipment.durationHours;
    const previousETA = shipment.expectedDeliveryAt || shipment.estimatedDeliveryDate;

    // Parse duration config
    const parsed = parseDurationConfig(validatedData);

    if (validatedData.startedAt) {
      shipment.startedAt = new Date(validatedData.startedAt);
      shipment.dispatchDate = shipment.startedAt;
    }

    const startTimestamp = (shipment.startedAt || shipment.dispatchDate || shipment.createdAt).getTime();

    shipment.durationConfig = parsed;
    shipment.durationHours = parsed.durationHours;

    if (parsed.isIndefinite) {
      shipment.expectedDeliveryAt = null;
      shipment.estimatedDeliveryDate = null;
    } else {
      const newETA = new Date(startTimestamp + parsed.durationHours * 60 * 60 * 1000);
      shipment.expectedDeliveryAt = newETA;
      shipment.estimatedDeliveryDate = newETA;
    }

    // Recompute server progress
    shipment.progressPercentage = calculateServerProgress(shipment);
    await shipment.save();

    const etaString = shipment.expectedDeliveryAt ? shipment.expectedDeliveryAt.toLocaleDateString() : 'Indefinite (Open-ended)';
    const eventDesc = `Shipment duration updated to ${parsed.isIndefinite ? 'Indefinite' : `${parsed.durationHours} hours`}. New Expected Delivery: ${etaString}.`;

    // Create ShipmentEvent
    const event = await ShipmentEvent.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      eventType: 'CUSTOM',
      previousStatus: shipment.status,
      newStatus: shipment.status,
      title: 'Delivery Schedule Updated',
      description: validatedData.notes ? `${eventDesc} Note: ${validatedData.notes}` : eventDesc,
      locationName: shipment.currentCoordinates.city || shipment.origin.city,
      coordinates: shipment.currentCoordinates,
      timestamp: new Date(),
      actor: req.user._id,
      actorRole: req.user.role,
      isPublic: true,
      customerVisible: true,
      metadata: { previousDuration, newDurationHours: parsed.durationHours, newETA: shipment.expectedDeliveryAt }
    });

    // Audit Log
    AuditLog.create({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'DURATION_UPDATED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      details: {
        previousDuration,
        newDuration: parsed.durationHours,
        isIndefinite: parsed.isIndefinite,
        newETA: shipment.expectedDeliveryAt
      }
    }).catch(() => {});

    // Broadcast Real-Time Socket.IO update
    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:duration_updated', {
      trackingNumber: shipment.trackingNumber,
      durationHours: parsed.durationHours,
      durationConfig: parsed,
      expectedDeliveryAt: shipment.expectedDeliveryAt,
      progressPercentage: shipment.progressPercentage,
      event
    });

    res.status(200).json({
      success: true,
      message: `Shipment duration updated to ${parsed.isIndefinite ? 'Indefinite' : `${parsed.durationHours} hrs`}.`,
      data: {
        trackingNumber: shipment.trackingNumber,
        durationConfig: shipment.durationConfig,
        durationHours: shipment.durationHours,
        startedAt: shipment.startedAt,
        expectedDeliveryAt: shipment.expectedDeliveryAt,
        progressPercentage: shipment.progressPercentage,
        event
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  updateShipmentDuration
};

