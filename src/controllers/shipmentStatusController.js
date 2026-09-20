const { Shipment, ShipmentEvent, ShipmentLocation, AuditLog } = require('../models');
const { sendShipmentStatusAlert } = require('../services/emailService');
const { notifyShipmentStakeholders } = require('../services/notificationService');
const { broadcastShipmentUpdate } = require('../config/socket');
const { resolveCityCoordinates } = require('../utils/cityCoordinates');
const logger = require('../utils/logger');

// Status configuration map with titles, default descriptions, alert themes and progress estimates
const STATUS_CONFIG = {
  created: {
    title: 'Shipment Registered',
    defaultDesc: 'Shipment order registered in Express Cargo system.',
    color: '#0284c7',
    progress: 5
  },
  awaiting_pickup: {
    title: 'Awaiting Carrier Pickup',
    defaultDesc: 'Parcel is packed and awaiting courier pickup at origin facility.',
    color: '#0284c7',
    progress: 10
  },
  picked_up: {
    title: 'Parcel Picked Up',
    defaultDesc: 'Shipment collected by Express Cargo courier.',
    color: '#0284c7',
    progress: 20
  },
  processing: {
    title: 'Processing at Hub',
    defaultDesc: 'Cargo sorting and weigh-in completed at departure processing center.',
    color: '#0284c7',
    progress: 30
  },
  in_transit: {
    title: 'In Transit',
    defaultDesc: 'Cargo is en route to next transit waypoint / destination hub.',
    color: '#2563eb',
    progress: 50
  },
  at_facility: {
    title: 'Arrived at Sorting Facility',
    defaultDesc: 'Consignment arrived at regional distribution center for sorting.',
    color: '#0284c7',
    progress: 65
  },
  customs_processing: {
    title: 'Customs Clearance Processing',
    defaultDesc: 'Consignment undergoing standard international customs examination.',
    color: '#d97706',
    progress: 70
  },
  customs_clearance: {
    title: 'Customs Cleared',
    defaultDesc: 'Import duty verification and customs inspection successfully cleared.',
    color: '#16a34a',
    progress: 75
  },
  out_for_delivery: {
    title: 'Out for Final Delivery',
    defaultDesc: 'Package dispatched with local courier for final doorstep delivery.',
    color: '#16a34a',
    progress: 90
  },
  delivery_attempted: {
    title: 'Delivery Attempted',
    defaultDesc: 'Courier attempted delivery. Consignee unavailable or address inaccessible.',
    color: '#ea580c',
    progress: 85
  },
  delayed: {
    title: 'Shipment Delayed',
    defaultDesc: 'Transit delayed due to weather, logistical routing or flight schedule adjust.',
    color: '#ea580c',
    progress: null
  },
  held: {
    title: 'Shipment On Hold',
    defaultDesc: 'Shipment temporarily held pending address confirmation or consignee instructions.',
    color: '#ea580c',
    progress: null
  },
  paused: {
    title: 'Transit Paused',
    defaultDesc: 'Shipment transit temporarily paused by dispatch controller.',
    color: '#d97706',
    progress: null
  },
  suspended: {
    title: 'Shipment Suspended',
    defaultDesc: 'Shipment has been suspended pending administrative review or security verification.',
    color: '#dc2626',
    progress: null
  },
  confiscated: {
    title: 'Shipment Confiscated',
    defaultDesc: 'Shipment has been seized/confiscated by border customs or regulatory authority.',
    color: '#dc2626',
    progress: null
  },
  cancelled: {
    title: 'Shipment Cancelled',
    defaultDesc: 'Shipment order has been voided / cancelled.',
    color: '#64748b',
    progress: 0
  },
  delivered: {
    title: 'Shipment Delivered',
    defaultDesc: 'Package successfully delivered and signed for by consignee.',
    color: '#16a34a',
    progress: 100
  }
};

/**
 * @desc Update shipment status with mandatory immutable ShipmentEvent history
 * @route PATCH /api/shipments/:id/status
 */
const updateShipmentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      status,
      statusReason,
      locationName,
      coordinates,
      description,
      customerVisible = true,
      progressPercentage
    } = req.body;

    const normalizedStatus = (status || '').toLowerCase().trim();
    const config = STATUS_CONFIG[normalizedStatus];

    if (!config) {
      return res.status(400).json({
        success: false,
        error: `Invalid status '${status}'. Valid statuses: ${Object.keys(STATUS_CONFIG).join(', ')}`
      });
    }

    // Find shipment
    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Shipment not found'
      });
    }

    const previousStatus = shipment.status;
    const eventLocationName = locationName || shipment.currentCoordinates.city || shipment.origin.city;
    const eventCoordinates = coordinates || {
      lat: shipment.currentCoordinates.lat || shipment.origin.coordinates.lat,
      lng: shipment.currentCoordinates.lng || shipment.origin.coordinates.lng
    };

    const finalDescription = description || statusReason || config.defaultDesc;

    // 1. Update Shipment record
    shipment.status = normalizedStatus;
    shipment.statusReason = finalDescription;

    if (progressPercentage !== undefined && progressPercentage !== null) {
      shipment.progressPercentage = Math.min(100, Math.max(0, Number(progressPercentage)));
    } else if (config.progress !== null) {
      shipment.progressPercentage = config.progress;
    }

    if (locationName) {
      const resolved = coordinates || resolveCityCoordinates(locationName, {
        lat: shipment.currentCoordinates.lat || shipment.origin.coordinates.lat,
        lng: shipment.currentCoordinates.lng || shipment.origin.coordinates.lng
      });
      shipment.currentCoordinates = {
        lat: resolved.lat,
        lng: resolved.lng,
        address: locationName,
        city: locationName.split(',')[0].trim(),
        country: locationName.includes(',') ? locationName.split(',').pop().trim() : (shipment.destination.country || ''),
        updatedAt: new Date()
      };
    } else if (coordinates) {
      shipment.currentCoordinates = {
        lat: coordinates.lat,
        lng: coordinates.lng,
        address: shipment.currentCoordinates.address,
        city: shipment.currentCoordinates.city,
        country: shipment.destination.country,
        updatedAt: new Date()
      };
    }

    if (normalizedStatus === 'delivered') {
      shipment.actualDeliveryDate = new Date();
      shipment.progressPercentage = 100;
    }

    await shipment.save();

    // 2. Create IMMUTABLE ShipmentEvent (Never overwrite history)
    const event = await ShipmentEvent.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      eventType: normalizedStatus.toUpperCase(),
      previousStatus,
      newStatus: normalizedStatus,
      title: config.title,
      description: finalDescription,
      locationName: eventLocationName,
      coordinates: eventCoordinates,
      timestamp: new Date(),
      actor: req.user ? req.user._id : null,
      actorRole: req.user ? req.user.role : 'admin',
      isPublic: customerVisible,
      customerVisible
    });

    // 3. Record GPS breadcrumb if coordinates provided
    if (coordinates) {
      await ShipmentLocation.create({
        shipment: shipment._id,
        trackingNumber: shipment.trackingNumber,
        coordinates: eventCoordinates,
        address: eventLocationName,
        city: eventLocationName.split(',')[0].trim(),
        country: shipment.destination.country,
        timestamp: new Date()
      });
    }

    // 4. Audit Log
    AuditLog.create({
      user: req.user ? req.user._id : null,
      userEmail: req.user ? req.user.email : 'system',
      action: `STATUS_CHANGE_${normalizedStatus.toUpperCase()}`,
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: {
        previousStatus,
        newStatus: normalizedStatus,
        reason: finalDescription,
        location: eventLocationName
      }
    }).catch(() => {});

    // 5. Send Real-Time Socket.IO Alert
    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:status_changed', {
      trackingNumber: shipment.trackingNumber,
      previousStatus,
      newStatus: normalizedStatus,
      statusTitle: config.title,
      description: finalDescription,
      color: config.color,
      progressPercentage: shipment.progressPercentage,
      currentLocation: shipment.currentCoordinates,
      event
    });

    // 6. Send Customer Email Notification in background
    sendShipmentStatusAlert(shipment, config.title, finalDescription, config.color).catch((err) =>
      logger.warn('Failed to send status update email:', err.message)
    );

    // 7. Send Real-Time In-App Customer Notification
    notifyShipmentStakeholders(shipment, config.title, finalDescription, 'STATUS_CHANGE', {
      previousStatus,
      newStatus: normalizedStatus
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: `Shipment status successfully transitioned from ${previousStatus} to ${normalizedStatus}.`,
      data: {
        shipment,
        event
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get complete immutable timeline event history for a shipment
 * @route GET /api/shipments/:id/events
 */
const getShipmentEvents = async (req, res, next) => {
  try {
    const { id } = req.params;
    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    }).select('_id trackingNumber');

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Shipment not found'
      });
    }

    const events = await ShipmentEvent.find({ shipment: shipment._id })
      .populate('actor', 'name email role')
      .sort({ timestamp: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: events.length,
      data: events
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Add manual custom event to shipment timeline
 * @route POST /api/shipments/:id/events
 */
const addCustomShipmentEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, locationName, coordinates, isPublic = true } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Event title and description are required.'
      });
    }

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Shipment not found'
      });
    }

    const event = await ShipmentEvent.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      eventType: 'CUSTOM',
      previousStatus: shipment.status,
      newStatus: shipment.status,
      title,
      description,
      locationName: locationName || shipment.currentCoordinates.city || shipment.origin.city,
      coordinates: coordinates || shipment.currentCoordinates,
      timestamp: new Date(),
      actor: req.user._id,
      actorRole: req.user.role,
      isPublic,
      customerVisible: isPublic
    });

    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:custom_event', {
      trackingNumber: shipment.trackingNumber,
      event
    });

    res.status(201).json({
      success: true,
      message: 'Custom timeline event logged successfully.',
      data: event
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  updateShipmentStatus,
  getShipmentEvents,
  addCustomShipmentEvent,
  STATUS_CONFIG
};

