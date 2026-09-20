const { Shipment, ShipmentLocation, ShipmentEvent, AuditLog } = require('../models');
const { broadcastShipmentUpdate } = require('../config/socket');
const logger = require('../utils/logger');
const { z } = require('zod');

const updateLocationSchema = z.object({
  coordinates: z.object({
    lat: z.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
    lng: z.number().min(-180).max(180, 'Longitude must be between -180 and 180')
  }),
  locationName: z.string().min(1, 'Location name is required'),
  description: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  speed: z.number().min(0).optional().default(0),
  heading: z.number().min(0).max(360).optional().default(0),
  altitude: z.number().optional().default(0),
  batteryLevel: z.number().min(0).max(100).optional().default(100),
  createEvent: z.boolean().optional().default(true)
});

/**
 * @desc Update shipment GPS location in real time (Admin / Staff / GPS Beacon)
 * @route PATCH /api/shipments/:id/location
 */
const updateShipmentLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = updateLocationSchema.parse(req.body);

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Shipment not found'
      });
    }

    const previousLocation = { ...shipment.currentCoordinates };

    // 1. Update Shipment currentCoordinates
    shipment.currentCoordinates = {
      lat: validatedData.coordinates.lat,
      lng: validatedData.coordinates.lng,
      address: validatedData.locationName,
      city: validatedData.city || validatedData.locationName.split(',')[0].trim(),
      country: validatedData.country || shipment.destination.country,
      updatedAt: new Date()
    };

    await shipment.save();

    // 2. Append to ShipmentLocation history
    const locationLog = await ShipmentLocation.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      coordinates: validatedData.coordinates,
      address: validatedData.locationName,
      city: validatedData.city || validatedData.locationName.split(',')[0].trim(),
      country: validatedData.country || shipment.destination.country,
      speed: validatedData.speed || 0,
      heading: validatedData.heading || 0,
      altitude: validatedData.altitude || 0,
      batteryLevel: validatedData.batteryLevel || 100,
      timestamp: new Date()
    });

    // 3. Create Timeline Event if requested
    let event = null;
    if (validatedData.createEvent) {
      event = await ShipmentEvent.create({
        shipment: shipment._id,
        trackingNumber: shipment.trackingNumber,
        eventType: 'LOCATION_UPDATE',
        previousStatus: shipment.status,
        newStatus: shipment.status,
        title: `Transit GPS Update: ${validatedData.locationName}`,
        description: validatedData.description || `Shipment arrived at / passing through ${validatedData.locationName}.`,
        locationName: validatedData.locationName,
        coordinates: validatedData.coordinates,
        timestamp: new Date(),
        actor: req.user ? req.user._id : null,
        actorRole: req.user ? req.user.role : 'system',
        isPublic: true,
        customerVisible: true
      });
    }

    // 4. Record Audit Log
    AuditLog.create({
      user: req.user ? req.user._id : null,
      userEmail: req.user ? req.user.email : 'system',
      action: 'LOCATION_UPDATED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      details: {
        previous: previousLocation,
        current: shipment.currentCoordinates,
        speed: validatedData.speed,
        heading: validatedData.heading
      }
    }).catch(() => {});

    // 5. Broadcast real-time Socket.IO notification to room
    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:location_updated', {
      trackingNumber: shipment.trackingNumber,
      currentLocation: shipment.currentCoordinates,
      speed: validatedData.speed,
      heading: validatedData.heading,
      timestamp: new Date(),
      event
    });

    res.status(200).json({
      success: true,
      message: 'Shipment location successfully updated and broadcasted.',
      data: {
        currentLocation: shipment.currentCoordinates,
        locationLog,
        event
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get complete GPS breadcrumb trail for map polyline rendering
 * @route GET /api/shipments/:id/locations
 */
const getShipmentLocationHistory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    }).select('_id trackingNumber origin destination');

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Shipment not found'
      });
    }

    const locations = await ShipmentLocation.find({ shipment: shipment._id }).sort({ timestamp: 1 }).lean();

    res.status(200).json({
      success: true,
      count: locations.length,
      data: {
        origin: shipment.origin,
        destination: shipment.destination,
        breadcrumbs: locations
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  updateShipmentLocation,
  getShipmentLocationHistory
};

