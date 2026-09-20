const { ShipmentCheckpoint, Shipment, ShipmentEvent, ShipmentLocation, AuditLog } = require('../models');
const { broadcastShipmentUpdate } = require('../config/socket');
const logger = require('../utils/logger');
const { z } = require('zod');

const checkpointSchema = z.object({
  checkpointName: z.string().min(1, 'Checkpoint name is required'),
  address: z.string().optional().default(''),
  city: z.string().min(1, 'City is required'),
  country: z.string().min(1, 'Country is required'),
  coordinates: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180)
  }),
  sequenceOrder: z.number().optional(),
  status: z.enum(['pending', 'in_transit', 'reached', 'departed', 'skipped']).default('pending'),
  estimatedArrival: z.string().or(z.date()).optional(),
  actualArrival: z.string().or(z.date()).optional(),
  estimatedDeparture: z.string().or(z.date()).optional(),
  actualDeparture: z.string().or(z.date()).optional(),
  notes: z.string().optional().default('')
});

const batchCheckpointsSchema = z.object({
  checkpoints: z.array(checkpointSchema)
});

/**
 * @desc Add one or multiple checkpoints to a shipment route
 * @route POST /api/shipments/:id/checkpoints
 */
const addCheckpoints = async (req, res, next) => {
  try {
    const { id } = req.params;
    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }

    const items = Array.isArray(req.body.checkpoints)
      ? batchCheckpointsSchema.parse(req.body).checkpoints
      : [checkpointSchema.parse(req.body)];

    // Find current highest sequenceOrder
    const lastCp = await ShipmentCheckpoint.findOne({ shipment: shipment._id }).sort({ sequenceOrder: -1 }).lean();
    let currentSeq = lastCp ? lastCp.sequenceOrder : 0;

    const docsToInsert = items.map((cp) => {
      currentSeq++;
      return {
        shipment: shipment._id,
        trackingNumber: shipment.trackingNumber,
        sequenceOrder: cp.sequenceOrder !== undefined ? cp.sequenceOrder : currentSeq,
        checkpointName: cp.checkpointName,
        address: cp.address || '',
        city: cp.city,
        country: cp.country,
        coordinates: cp.coordinates,
        status: cp.status || 'pending',
        estimatedArrival: cp.estimatedArrival ? new Date(cp.estimatedArrival) : undefined,
        actualArrival: cp.actualArrival ? new Date(cp.actualArrival) : undefined,
        estimatedDeparture: cp.estimatedDeparture ? new Date(cp.estimatedDeparture) : undefined,
        actualDeparture: cp.actualDeparture ? new Date(cp.actualDeparture) : undefined,
        notes: cp.notes || ''
      };
    });

    const inserted = await ShipmentCheckpoint.insertMany(docsToInsert);

    // Audit log
    AuditLog.create({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'CHECKPOINTS_ADDED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      details: { count: inserted.length }
    }).catch(() => {});

    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:checkpoints_updated', {
      trackingNumber: shipment.trackingNumber,
      checkpoints: await ShipmentCheckpoint.find({ shipment: shipment._id }).sort({ sequenceOrder: 1 }).lean()
    });

    res.status(201).json({
      success: true,
      message: `${inserted.length} checkpoint(s) successfully added to route.`,
      data: inserted
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get all checkpoints for a shipment in sequence order
 * @route GET /api/shipments/:id/checkpoints
 */
const getShipmentCheckpoints = async (req, res, next) => {
  try {
    const { id } = req.params;
    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    }).select('_id trackingNumber');

    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }

    const checkpoints = await ShipmentCheckpoint.find({ shipment: shipment._id }).sort({ sequenceOrder: 1 }).lean();

    res.status(200).json({
      success: true,
      count: checkpoints.length,
      data: checkpoints
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Update checkpoint details & status (automatically feeds timeline)
 * @route PUT /api/shipments/:id/checkpoints/:checkpointId
 */
const updateCheckpoint = async (req, res, next) => {
  try {
    const { id, checkpointId } = req.params;
    const validatedData = checkpointSchema.partial().parse(req.body);

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }

    const checkpoint = await ShipmentCheckpoint.findOne({ _id: checkpointId, shipment: shipment._id });
    if (!checkpoint) {
      return res.status(404).json({ success: false, error: 'Checkpoint not found' });
    }

    const prevStatus = checkpoint.status;
    Object.assign(checkpoint, validatedData);

    if (validatedData.status === 'reached' && !checkpoint.actualArrival) {
      checkpoint.actualArrival = new Date();
    } else if (validatedData.status === 'departed' && !checkpoint.actualDeparture) {
      checkpoint.actualDeparture = new Date();
    }

    await checkpoint.save();

    // If status changed to reached or departed, generate a milestone timeline event
    let generatedEvent = null;
    if (validatedData.status && validatedData.status !== prevStatus) {
      let eventType = 'ARRIVED_CHECKPOINT';
      let eventTitle = `Arrived at ${checkpoint.checkpointName}`;
      let eventDesc = `Shipment arrived at transit waypoint ${checkpoint.checkpointName} (${checkpoint.city}, ${checkpoint.country}).`;

      if (validatedData.status === 'departed') {
        eventType = 'DEPARTED_CHECKPOINT';
        eventTitle = `Departed ${checkpoint.checkpointName}`;
        eventDesc = `Shipment processed and departed from ${checkpoint.checkpointName} towards next hub.`;
      } else if (validatedData.status === 'in_transit') {
        eventType = 'IN_TRANSIT';
        eventTitle = `En Route to ${checkpoint.checkpointName}`;
        eventDesc = `Cargo in transit approaching ${checkpoint.checkpointName}.`;
      }

      generatedEvent = await ShipmentEvent.create({
        shipment: shipment._id,
        trackingNumber: shipment.trackingNumber,
        eventType,
        previousStatus: shipment.status,
        newStatus: shipment.status,
        title: eventTitle,
        description: checkpoint.notes ? `${eventDesc} Note: ${checkpoint.notes}` : eventDesc,
        locationName: `${checkpoint.city}, ${checkpoint.country}`,
        coordinates: checkpoint.coordinates,
        timestamp: new Date(),
        actor: req.user._id,
        actorRole: req.user.role,
        isPublic: true,
        customerVisible: true
      });

      // Update current coordinates of shipment
      if (validatedData.status === 'reached') {
        shipment.currentCoordinates = {
          lat: checkpoint.coordinates.lat,
          lng: checkpoint.coordinates.lng,
          address: checkpoint.address || checkpoint.checkpointName,
          city: checkpoint.city,
          country: checkpoint.country,
          updatedAt: new Date()
        };
        await shipment.save();

        await ShipmentLocation.create({
          shipment: shipment._id,
          trackingNumber: shipment.trackingNumber,
          coordinates: checkpoint.coordinates,
          address: checkpoint.checkpointName,
          city: checkpoint.city,
          country: checkpoint.country,
          timestamp: new Date()
        });
      }
    }

    // Audit Log
    AuditLog.create({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'CHECKPOINT_UPDATED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      details: { checkpointId, updates: validatedData }
    }).catch(() => {});

    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:checkpoint_updated', {
      trackingNumber: shipment.trackingNumber,
      checkpoint,
      currentLocation: shipment.currentCoordinates,
      event: generatedEvent
    });

    res.status(200).json({
      success: true,
      message: 'Checkpoint updated successfully.',
      data: {
        checkpoint,
        event: generatedEvent
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Delete a checkpoint
 * @route DELETE /api/shipments/:id/checkpoints/:checkpointId
 */
const deleteCheckpoint = async (req, res, next) => {
  try {
    const { id, checkpointId } = req.params;
    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }

    const checkpoint = await ShipmentCheckpoint.findOneAndDelete({ _id: checkpointId, shipment: shipment._id });
    if (!checkpoint) {
      return res.status(404).json({ success: false, error: 'Checkpoint not found' });
    }

    // Re-index remaining sequence orders
    const remaining = await ShipmentCheckpoint.find({ shipment: shipment._id }).sort({ sequenceOrder: 1 });
    for (let i = 0; i < remaining.length; i++) {
      remaining[i].sequenceOrder = i + 1;
      await remaining[i].save();
    }

    res.status(200).json({
      success: true,
      message: 'Checkpoint deleted and route waypoints re-sequenced.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Reorder all checkpoints in route
 * @route PUT /api/shipments/:id/checkpoints/reorder
 */
const reorderCheckpoints = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { orderedIds } = req.body; // Array of checkpoint IDs in new order

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, error: 'orderedIds array required' });
    }

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }

    for (let i = 0; i < orderedIds.length; i++) {
      await ShipmentCheckpoint.findOneAndUpdate(
        { _id: orderedIds[i], shipment: shipment._id },
        { sequenceOrder: i + 1 }
      );
    }

    const reordered = await ShipmentCheckpoint.find({ shipment: shipment._id }).sort({ sequenceOrder: 1 }).lean();

    res.status(200).json({
      success: true,
      message: 'Route checkpoints successfully re-sequenced.',
      data: reordered
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addCheckpoints,
  getShipmentCheckpoints,
  updateCheckpoint,
  deleteCheckpoint,
  reorderCheckpoints
};

