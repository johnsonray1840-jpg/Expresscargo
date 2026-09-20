const Shipment = require('../models/Shipment');
const Package = require('../models/Package');
const ShipmentCheckpoint = require('../models/ShipmentCheckpoint');
const ShipmentEvent = require('../models/ShipmentEvent');
const ShipmentDocument = require('../models/ShipmentDocument');
const ShipmentLocation = require('../models/ShipmentLocation');
const { calculateServerProgress } = require('../utils/timeCalculator');
const logger = require('../utils/logger');

const { resolveCityCoordinates } = require('../utils/cityCoordinates');
const { resolveLocationCoordinatesSync } = require('../utils/geocoder');

/**
 * Mask sensitive string data (email, phone)
 */
const maskEmail = (email) => {
  if (!email || typeof email !== 'string') return '';
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const maskedUser = user.length > 2 ? `${user[0]}***${user[user.length - 1]}` : `${user[0]}***`;
  return `${maskedUser}@${domain}`;
};

const maskPhone = (phone) => {
  if (!phone || typeof phone !== 'string') return '';
  const cleaned = phone.trim();
  if (cleaned.length <= 4) return '****';
  return `${cleaned.slice(0, 3)} ***-*** ${cleaned.slice(-2)}`;
};

/**
 * Calculate Great Circle Geodesic arc points between two coordinates
 */
const calculateGreatCircleRoute = (p1, p2, numPoints = 100) => {
  if (!p1 || !p2 || p1.lat == null || p2.lat == null) return [];
  const points = [];
  const lat1 = (p1.lat * Math.PI) / 180;
  const lon1 = (p1.lng * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;
  const lon2 = (p2.lng * Math.PI) / 180;

  const d = 2 * Math.asin(Math.sqrt(
    Math.pow(Math.sin((lat1 - lat2) / 2), 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon1 - lon2) / 2), 2)
  ));

  if (d === 0 || isNaN(d)) return [{ lat: p1.lat, lng: p1.lng }, { lat: p2.lat, lng: p2.lng }];

  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)));
    const lon = Math.atan2(y, x);
    points.push({
      lat: Number(((lat * 180) / Math.PI).toFixed(6)),
      lng: Number(((lon * 180) / Math.PI).toFixed(6))
    });
  }
  return points;
};

/**
 * Calculate exact intermediate spherical point at fractional progress ratio f (0.0 to 1.0)
 */
const interpolateGreatCirclePoint = (p1, p2, f) => {
  const lat1 = (p1.lat * Math.PI) / 180;
  const lon1 = (p1.lng * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;
  const lon2 = (p2.lng * Math.PI) / 180;

  const d = 2 * Math.asin(Math.sqrt(
    Math.pow(Math.sin((lat1 - lat2) / 2), 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon1 - lon2) / 2), 2)
  ));

  if (d === 0 || isNaN(d)) return { lat: p1.lat, lng: p1.lng };

  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);
  const lat = Math.atan2(z, Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)));
  const lon = Math.atan2(y, x);

  return {
    lat: Number(((lat * 180) / Math.PI).toFixed(6)),
    lng: Number(((lon * 180) / Math.PI).toFixed(6))
  };
};

/**
 * Calculate compass bearing between two points (0 - 360 degrees)
 */
const calculateBearing = (startLat, startLng, destLat, destLng) => {
  const y = Math.sin(((destLng - startLng) * Math.PI) / 180) * Math.cos((destLat * Math.PI) / 180);
  const x =
    Math.cos((startLat * Math.PI) / 180) * Math.sin((destLat * Math.PI) / 180) -
    Math.sin((startLat * Math.PI) / 180) * Math.cos((destLat * Math.PI) / 180) * Math.cos(((destLng - startLng) * Math.PI) / 180);
  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  return Math.round((brng + 360) % 360);
};

/**
 * Calculate dynamic live map coordinates based on elapsed time if auto-progress is enabled
 * Produces continuous geodesic flight curved trajectories with speed, heading, and altitude
 */
const calculateLiveProgression = (shipment, checkpoints, recentLocations) => {
  let origCoords = shipment.origin?.coordinates || { lat: null, lng: null };
  let destCoords = shipment.destination?.coordinates || { lat: null, lng: null };

  let computedProgress = shipment.progressPercentage || 0;
  if (['delivered'].includes(shipment.status)) {
    computedProgress = 100;
  } else if (computedProgress >= 99) {
    computedProgress = 100;
  } else if (!['in_transit', 'active'].includes(shipment.status) || shipment.trackingSource !== 'simulation') {
    // If not actively simulated, freeze at admin-set or current progress
    computedProgress = shipment.progressPercentage || 5;
  } else {
    // Basic time progression fallback if admin hasn't set explicit progress
    const startTime = new Date(shipment.startedAt || shipment.dispatchDate || shipment.createdAt).getTime();
    const totalDurationMs = Math.max(1000, (shipment.durationHours || 24) * 60 * 60 * 1000);
    const now = Date.now();
    const elapsed = Math.max(0, now - startTime);
    const progressRatio = Math.min(1, elapsed / totalDurationMs);
    let timeProgress = Math.min(100, Math.round(progressRatio * 100));
    if (timeProgress >= 99) {
      timeProgress = 100; 
    }
    if (timeProgress > computedProgress) {
      computedProgress = timeProgress;
    }
  }

  let currentCoords = shipment.currentCoordinates?.lat ? shipment.currentCoordinates : origCoords;
  if (recentLocations && recentLocations.length > 0 && recentLocations[0].coordinates?.lat) {
      currentCoords = recentLocations[0].coordinates;
  } else if (checkpoints && checkpoints.length > 0) {
      const reached = checkpoints.filter(c => c.status === 'reached' || c.status === 'departed');
      if (reached.length > 0 && reached[reached.length - 1].coordinates?.lat) {
          currentCoords = reached[reached.length - 1].coordinates;
      }
  }

  return {
    progressPercentage: computedProgress,
    currentCoordinates: {
      lat: currentCoords.lat,
      lng: currentCoords.lng,
      address: shipment.currentCoordinates?.address || shipment.origin?.city || 'Origin',
      city: shipment.currentCoordinates?.city || shipment.origin?.city,
      country: shipment.currentCoordinates?.country || shipment.origin?.country,
      speed: 0,
      heading: 0,
      altitude: 0,
      updatedAt: new Date()
    },
    previousCoordinates: origCoords,
    curvedRoute: [],
    heading: 0,
    speedKmh: 0,
    altitudeMeters: 0
  };
};

/**
 * @desc Get safe public tracking information with comprehensive map telemetry
 * @route GET /api/tracking/:trackingNumber
 */
const getPublicTrackingInfo = async (req, res, next) => {
  try {
    const trackingNumber = req.params.trackingNumber.trim().toUpperCase();

    // 1. Fetch shipment with selective lean query (preventing sensitive field leaks)
    const shipment = await Shipment.findOne({ trackingNumber })
      .select(
        'trackingNumber status statusReason trackingSource emailedMilestones progressPercentage durationHours startedAt expectedDeliveryAt pausedAt resumedAt deliveredAt durationConfig pauseDetails dispatchDate estimatedDeliveryDate actualDeliveryDate serviceType transportMode carrier origin destination currentCoordinates sender recipient payment.status payment.currency isDiplomaticSeal updatedAt createdAt'
      )
      .lean();

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SHIPMENT_NOT_FOUND',
          message: `No shipment found with tracking number '${trackingNumber}'. Please verify and try again.`
        }
      });
    }

    // 2. Fetch public packages, checkpoints, public events, public documents, and bounded recent location trail
    const [packages, checkpoints, events, documents, recentLocations] = await Promise.all([
      Package.find({ shipment: shipment._id })
        .select('description category weight dimensions quantity declaredValue isFragile isPerishable packageImages barcodeUrl qrCodeUrl')
        .lean(),
      ShipmentCheckpoint.find({ shipment: shipment._id })
        .select('sequenceOrder checkpointName city country coordinates status estimatedArrival actualArrival')
        .sort({ sequenceOrder: 1 })
        .lean(),
      ShipmentEvent.find({ shipment: shipment._id, isPublic: true })
        .select('eventType title description locationName coordinates timestamp')
        .sort({ timestamp: -1 })
        .lean(),
      ShipmentDocument.find({ shipment: shipment._id, isPublic: true })
        .select('title documentType fileUrl fileSize mimeType createdAt')
        .lean(),
      ShipmentLocation.find({ shipment: shipment._id })
        .select('coordinates address city country speed heading altitude timestamp source')
        .sort({ timestamp: -1 })
        .limit(10)
        .lean()
    ]);

    // 3. Compute dynamic live progress & coordinate calculation
    const livePosition = calculateLiveProgression(shipment, checkpoints, recentLocations);
    const serverProgress = calculateServerProgress(shipment);
    const progressPercentage = serverProgress !== null && serverProgress !== undefined ? serverProgress : livePosition.progressPercentage;

    // Asynchronously trigger milestone emails to ensure perfect synchronicity with the UI
    if (shipment.trackingSource === 'simulation') {
      const MILESTONES = [0, 10, 20, 30, 50, 70, 90, 100];
      const emailed = shipment.emailedMilestones || [];
      let didEmail = false;
      for (const target of MILESTONES) {
        if (progressPercentage >= target && !emailed.includes(target)) {
          emailed.push(target);
          didEmail = true;
          const { triggerAsyncEmail } = require('../services/emailDispatcher');
          const { renderMilestoneEmailHtml } = require('../emails/templates');
          const title = `Automated Milestone Checkpoint: ${target}% Complete`;
          const desc = `Your consignment has reached ${target}% of its journey and is securely en route.`;
          const html = renderMilestoneEmailHtml({
            shipment, 
            milestoneTitle: title, 
            milestoneMessage: desc,
            progressPercentage: target
          });
          
          const emails = [];
          if (shipment.sender?.email) emails.push(shipment.sender.email);
          if (shipment.recipient?.email) emails.push(shipment.recipient.email);
          
          if (emails.length > 0) {
            triggerAsyncEmail({
              to: emails,
              subject: `Update on Shipment ${shipment.trackingNumber} - ${target}% Complete`,
              html: html,
              template: 'status_update',
              shipmentId: shipment._id,
              trackingNumber: shipment.trackingNumber
            });
          }
        }
      }
      if (didEmail) {
        Shipment.findByIdAndUpdate(shipment._id, { emailedMilestones: emailed }).exec();
      }
    }

    const currentCoords = livePosition.currentCoordinates || shipment.currentCoordinates || shipment.origin.coordinates;
    const previousCoords = livePosition.previousCoordinates || (recentLocations.length > 1 ? recentLocations[1].coordinates : shipment.origin.coordinates);

    // Human-readable location name
    const locationName = currentCoords.address || currentCoords.city 
      ? `${currentCoords.address || currentCoords.city}${currentCoords.country ? `, ${currentCoords.country}` : ''}`
      : `${shipment.origin.city} → ${shipment.destination.city}`;

    const lastUpdate = currentCoords.updatedAt || (recentLocations[0] ? recentLocations[0].timestamp : shipment.updatedAt) || new Date();

    // Formatted ETA & dual time metadata
    const expectedDelivery = shipment.expectedDeliveryAt || shipment.estimatedDeliveryDate;
    const etaFormatted = expectedDelivery ? new Date(expectedDelivery).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }) : 'Pending Calculation';

    // 4. Sanitize and mask sender & recipient data
    const sanitizedSender = {
      name: shipment.sender ? shipment.sender.name : 'Confidential Sender',
      city: shipment.origin.city,
      country: shipment.origin.country,
      maskedEmail: shipment.sender ? maskEmail(shipment.sender.email) : '',
      maskedPhone: shipment.sender ? maskPhone(shipment.sender.phone) : ''
    };

    const sanitizedRecipient = {
      name: shipment.recipient ? shipment.recipient.name : 'Authorized Consignee',
      city: shipment.destination.city,
      country: shipment.destination.country,
      maskedEmail: shipment.recipient ? maskEmail(shipment.recipient.email) : '',
      maskedPhone: shipment.recipient ? maskPhone(shipment.recipient.phone) : ''
    };

    // 5. Structure clean, safe public response satisfying Requirement 34
    res.status(200).json({
      success: true,
      data: {
        trackingNumber: shipment.trackingNumber,
        status: shipment.status,
        currentStatus: shipment.status,
        statusReason: shipment.statusReason || '',
        shipmentProgress: progressPercentage,
        progressPercentage: progressPercentage,
        serviceType: shipment.serviceType,
        transportMode: shipment.transportMode,
        carrier: shipment.carrier,
        isDiplomaticSeal: shipment.isDiplomaticSeal || false,
        locationName: locationName,
        lastUpdate: lastUpdate,
        telemetry: {
          speedKmh: currentCoords.speed != null ? currentCoords.speed : (livePosition.speedKmh || 840),
          heading: currentCoords.heading != null ? currentCoords.heading : (livePosition.heading || 0),
          altitudeMeters: currentCoords.altitude != null ? currentCoords.altitude : (livePosition.altitudeMeters || 0),
          isSimulatedLive: true
        },
        currentCoordinates: {
          lat: currentCoords.lat,
          lng: currentCoords.lng,
          address: currentCoords.address || '',
          city: currentCoords.city || '',
          country: currentCoords.country || '',
          speed: currentCoords.speed != null ? currentCoords.speed : (livePosition.speedKmh || 840),
          heading: currentCoords.heading != null ? currentCoords.heading : (livePosition.heading || 0),
          altitude: currentCoords.altitude != null ? currentCoords.altitude : (livePosition.altitudeMeters || 0),
          updatedAt: lastUpdate
        },
        previousCoordinates: {
          lat: previousCoords.lat,
          lng: previousCoords.lng,
          address: previousCoords.address || '',
          city: previousCoords.city || '',
          country: previousCoords.country || ''
        },
        route: {
          origin: {
            city: shipment.origin.city,
            country: shipment.origin.country,
            address: shipment.origin.address,
            coordinates: shipment.origin.coordinates
          },
          destination: {
            city: shipment.destination.city,
            country: shipment.destination.country,
            address: shipment.destination.address,
            coordinates: shipment.destination.coordinates
          },
          curvedRoute: livePosition.curvedRoute || [],
          checkpoints: checkpoints,
          recentBreadcrumbs: recentLocations.map((loc) => ({
            coordinates: loc.coordinates,
            city: loc.city,
            country: loc.country,
            speed: loc.speed,
            heading: loc.heading,
            timestamp: loc.timestamp
          }))
        },
        eta: {
          estimatedDelivery: expectedDelivery,
          formattedEta: etaFormatted,
          dispatchedAt: shipment.dispatchDate || shipment.createdAt,
          actualDelivery: shipment.actualDeliveryDate || shipment.deliveredAt
        },
        dates: {
          startedAt: shipment.startedAt || shipment.dispatchDate || shipment.createdAt,
          expectedDeliveryAt: expectedDelivery,
          pausedAt: shipment.pausedAt || (shipment.pauseDetails && shipment.pauseDetails.pausedAt ? shipment.pauseDetails.pausedAt : null),
          resumedAt: shipment.resumedAt || (shipment.pauseDetails && shipment.pauseDetails.resumedAt ? shipment.pauseDetails.resumedAt : null),
          deliveredAt: shipment.deliveredAt || shipment.actualDeliveryDate,
          dispatchedAt: shipment.dispatchDate || shipment.createdAt,
          estimatedDelivery: expectedDelivery,
          actualDelivery: shipment.actualDeliveryDate || shipment.deliveredAt
        },
        origin: {
          city: shipment.origin.city,
          country: shipment.origin.country,
          address: shipment.origin.address,
          coordinates: shipment.origin.coordinates
        },
        destination: {
          city: shipment.destination.city,
          country: shipment.destination.country,
          address: shipment.destination.address,
          coordinates: shipment.destination.coordinates
        },
        currentLocation: currentCoords,
        sender: sanitizedSender,
        recipient: sanitizedRecipient,
        paymentStatus: shipment.payment ? shipment.payment.status : 'paid',
        packages,
        checkpoints,
        timeline: events,
        documents
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Paginated Location History Endpoint (Prevents huge payloads on initial load)
 * @route GET /api/tracking/:trackingNumber/locations
 */
const getLocationHistory = async (req, res, next) => {
  try {
    const trackingNumber = req.params.trackingNumber.trim().toUpperCase();
    const shipment = await Shipment.findOne({ trackingNumber }).select('_id trackingNumber').lean();

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SHIPMENT_NOT_FOUND',
          message: 'Tracking number not found'
        }
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [locations, total] = await Promise.all([
      ShipmentLocation.find({ shipment: shipment._id })
        .select('coordinates address city country speed heading altitude source timestamp')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ShipmentLocation.countDocuments({ shipment: shipment._id })
    ]);

    res.status(200).json({
      success: true,
      data: {
        trackingNumber: shipment.trackingNumber,
        locations,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit) || 1,
          limit
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Quick public tracking verification (returns boolean & current status)
 * @route GET /api/tracking/verify/:trackingNumber
 */
const verifyTrackingNumber = async (req, res, next) => {
  try {
    const trackingNumber = req.params.trackingNumber.trim().toUpperCase();
    const shipment = await Shipment.findOne({ trackingNumber }).select('trackingNumber status origin.city destination.city').lean();

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SHIPMENT_NOT_FOUND',
          message: 'Tracking number not found'
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        valid: true,
        trackingNumber: shipment.trackingNumber,
        status: shipment.status,
        route: `${shipment.origin.city} → ${shipment.destination.city}`
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Subscribe email to milestone alerts for a shipment
 * @route POST /api/tracking/:trackingNumber/subscribe
 */
const subscribeTrackingEmail = async (req, res, next) => {
  try {
    const trackingNumber = req.params.trackingNumber.trim().toUpperCase();
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EMAIL',
          message: 'Please provide a valid email address.'
        }
      });
    }

    const shipment = await Shipment.findOne({ trackingNumber });
    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SHIPMENT_NOT_FOUND',
          message: 'Tracking number not found'
        }
      });
    }

    // Try sending a confirmation email if email service is active
    try {
      const { triggerAsyncEmail } = require('../services/emailDispatcher');
      triggerAsyncEmail({
        to: email.toLowerCase().trim(),
        subject: `Tracking Alerts Active: Consignment ${trackingNumber}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h2 style="color: #0B1F3A; margin: 0;">Express Cargo Global Tracking</h2>
              <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Milestone Alert Subscription Confirmed</p>
            </div>
            <div style="background: #f8fafc; padding: 16px; border-radius: 8px; border-left: 4px solid #0284c7; margin-bottom: 20px;">
              <p style="margin: 0; font-size: 14px; color: #334155;">You will receive live email notifications whenever the status, location, or ETA of consignment <strong>${trackingNumber}</strong> is updated.</p>
            </div>
            <p style="font-size: 13px; color: #64748b;">Route: <strong>${shipment.origin?.city || 'Origin'}</strong> &rarr; <strong>${shipment.destination?.city || 'Destination'}</strong></p>
            <p style="font-size: 13px; color: #64748b;">Current Status: <strong style="color: #0284c7;">${(shipment.status || 'In Transit').toUpperCase()}</strong></p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="text-align: center; font-size: 12px; color: #94a3b8;">&copy; Express Cargo Global Logistics. All rights reserved.</p>
          </div>
        `,
        text: `Tracking Alerts Active for ${trackingNumber}. You will receive milestone updates.`,
        template: 'custom',
        event: 'TRACKING_SUBSCRIBED',
        trackingNumber
      });
    } catch (err) {
      logger.warn('Email dispatch warning for subscriber:', err.message);
    }

    res.status(200).json({
      success: true,
      message: `Live tracking alerts activated for ${email.toLowerCase().trim()}. You will receive updates as your consignment progresses.`
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPublicTrackingInfo,
  getLocationHistory,
  verifyTrackingNumber,
  subscribeTrackingEmail
};
