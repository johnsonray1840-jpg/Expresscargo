const { Shipment, ShipmentLocation, ShipmentCheckpoint, ShipmentEvent, AuditLog } = require('../models');
const { broadcastShipmentUpdate } = require('../config/socket');
const logger = require('../utils/logger');
const { z } = require('zod');

const simulationConfigSchema = z.object({
  startCoordinates: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      address: z.string().optional()
    })
    .optional(),
  destinationCoordinates: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      address: z.string().optional()
    })
    .optional(),
  simulationSpeed: z.number().min(1).default(80),
  speedMultiplier: z.number().min(0.1).max(50).default(1),
  updateIntervalSeconds: z.number().min(1).max(3600).default(10),
  totalSteps: z.number().min(10).max(1000).default(100),
  autoProgress: z.boolean().default(true),
  checkpoints: z
    .array(
      z.object({
        checkpointName: z.string(),
        city: z.string(),
        country: z.string(),
        coordinates: z.object({
          lat: z.number(),
          lng: z.number()
        })
      })
    )
    .optional()
});

/**
 * Interpolate coordinate point along multi-point route path
 */
const interpolatePath = (points, progressRatio) => {
  if (!points || points.length === 0) return { lat: 0, lng: 0, name: '' };
  if (points.length === 1) return { ...points[0].coordinates, name: points[0].name };

  const clampedProgress = Math.max(0, Math.min(1, progressRatio));
  const segmentCount = points.length - 1;
  const exactSegment = clampedProgress * segmentCount;
  const segmentIndex = Math.min(Math.floor(exactSegment), segmentCount - 1);
  const segmentFraction = exactSegment - segmentIndex;

  const p1 = points[segmentIndex].coordinates;
  const p2 = points[segmentIndex + 1].coordinates;

  const lat = Number((p1.lat + (p2.lat - p1.lat) * segmentFraction).toFixed(6));
  const lng = Number((p1.lng + (p2.lng - p1.lng) * segmentFraction).toFixed(6));

  // Calculate heading in degrees (0 - 360)
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  let heading = (Math.atan2(y, x) * 180) / Math.PI;
  heading = (heading + 360) % 360;

  return {
    lat,
    lng,
    heading: Math.round(heading),
    fromName: points[segmentIndex].name,
    toName: points[segmentIndex + 1].name,
    segmentIndex
  };
};

/**
 * @desc Configure and initialize simulation mode for a shipment (Admin Only)
 * @route POST /api/shipments/:id/simulation/config
 */
const configureSimulation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = simulationConfigSchema.parse(req.body);

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Shipment not found'
      });
    }

    // Update coordinates if custom start/destination passed
    if (validatedData.startCoordinates) {
      shipment.origin.coordinates = {
        lat: validatedData.startCoordinates.lat,
        lng: validatedData.startCoordinates.lng
      };
      if (validatedData.startCoordinates.address) shipment.origin.address = validatedData.startCoordinates.address;
    }

    if (validatedData.destinationCoordinates) {
      shipment.destination.coordinates = {
        lat: validatedData.destinationCoordinates.lat,
        lng: validatedData.destinationCoordinates.lng
      };
      if (validatedData.destinationCoordinates.address) shipment.destination.address = validatedData.destinationCoordinates.address;
    }

    // Set simulation configuration
    shipment.trackingSource = 'simulation';
    shipment.simulationConfig = {
      isSimulated: true,
      autoProgress: validatedData.autoProgress,
      simulationSpeed: validatedData.simulationSpeed,
      speedMultiplier: validatedData.speedMultiplier,
      updateIntervalSeconds: validatedData.updateIntervalSeconds,
      totalSteps: validatedData.totalSteps,
      currentStep: 0,
      startTime: new Date(),
      lastCalculatedAt: new Date(),
      currentCheckpointIndex: 0
    };

    // Replace or insert custom checkpoints if provided
    if (validatedData.checkpoints && validatedData.checkpoints.length > 0) {
      await ShipmentCheckpoint.deleteMany({ shipment: shipment._id });
      const newCheckpoints = validatedData.checkpoints.map((cp, idx) => ({
        shipment: shipment._id,
        trackingNumber: shipment.trackingNumber,
        sequenceOrder: idx + 1,
        checkpointName: cp.checkpointName,
        city: cp.city,
        country: cp.country,
        coordinates: cp.coordinates,
        status: idx === 0 ? 'in_transit' : 'pending'
      }));
      await ShipmentCheckpoint.insertMany(newCheckpoints);
    }

    await shipment.save();

    // Log admin audit
    AuditLog.create({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'SIMULATION_CONFIGURED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      details: validatedData
    }).catch(() => {});

    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:simulation_configured', {
      trackingNumber: shipment.trackingNumber,
      trackingSource: 'simulation',
      simulationConfig: shipment.simulationConfig
    });

    res.status(200).json({
      success: true,
      message: 'Simulation mode successfully configured.',
      data: {
        trackingNumber: shipment.trackingNumber,
        trackingSource: shipment.trackingSource,
        simulationConfig: shipment.simulationConfig
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Advance simulation step or percentage (Admin / Automated Cron)
 * @route POST /api/shipments/:id/simulation/step
 */
const advanceSimulationStep = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { stepIncrement = 1, targetPercentage = null } = req.body;

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Shipment not found'
      });
    }

    const checkpoints = await ShipmentCheckpoint.find({ shipment: shipment._id }).sort({ sequenceOrder: 1 }).lean();

    const allPoints = [
      { coordinates: shipment.origin.coordinates, name: shipment.origin.city },
      ...checkpoints.map((cp) => ({ coordinates: cp.coordinates, name: cp.city })),
      { coordinates: shipment.destination.coordinates, name: shipment.destination.city }
    ];

    const totalSteps = shipment.simulationConfig.totalSteps || 100;
    let nextStep;

    if (targetPercentage !== null && targetPercentage !== undefined) {
      nextStep = Math.round((Number(targetPercentage) / 100) * totalSteps);
    } else {
      nextStep = (shipment.simulationConfig.currentStep || 0) + Number(stepIncrement);
    }

    nextStep = Math.max(0, Math.min(totalSteps, nextStep));
    const progressRatio = nextStep / totalSteps;
    const computedPercentage = Math.round(progressRatio * 100);

    // Compute Interpolated Location & Heading
    const interpolated = interpolatePath(allPoints, progressRatio);

    const locationName = `Simulated Transit near ${interpolated.toName || shipment.destination.city}`;

    // Update Shipment
    shipment.trackingSource = 'simulation';
    shipment.progressPercentage = computedPercentage;
    shipment.simulationConfig.currentStep = nextStep;
    shipment.simulationConfig.lastCalculatedAt = new Date();

    shipment.currentCoordinates = {
      lat: interpolated.lat,
      lng: interpolated.lng,
      address: locationName,
      city: interpolated.toName || shipment.destination.city,
      country: shipment.destination.country,
      updatedAt: new Date()
    };

    if (computedPercentage >= 100 && shipment.status !== 'delivered') {
      shipment.status = 'delivered';
      shipment.statusReason = 'Simulated delivery reached destination.';
      shipment.actualDeliveryDate = new Date();
    } else if (shipment.status === 'created' || shipment.status === 'pending') {
      shipment.status = 'in_transit';
    }

    await shipment.save();

    // Persist simulated location entry (with explicit source: 'simulation' flag)
    const simulatedLocation = await ShipmentLocation.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      coordinates: { lat: interpolated.lat, lng: interpolated.lng },
      address: locationName,
      city: interpolated.toName || shipment.destination.city,
      country: shipment.destination.country,
      speed: (shipment.simulationConfig.simulationSpeed || 80) * (shipment.simulationConfig.speedMultiplier || 1),
      heading: interpolated.heading || 0,
      source: 'simulation',
      timestamp: new Date()
    });

    // Update checkpoint statuses that were passed
    if (checkpoints.length > 0) {
      for (let i = 0; i < checkpoints.length; i++) {
        const cp = checkpoints[i];
        const cpThresholdRatio = (i + 1) / (checkpoints.length + 1);
        if (progressRatio >= cpThresholdRatio && cp.status !== 'reached') {
          await ShipmentCheckpoint.findByIdAndUpdate(cp._id, {
            status: 'reached',
            actualArrival: new Date()
          });
        }
      }
    }

    // Broadcast live telemetry update over Socket.IO
    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:location_updated', {
      trackingNumber: shipment.trackingNumber,
      trackingSource: 'simulation',
      currentLocation: shipment.currentCoordinates,
      speed: simulatedLocation.speed,
      heading: simulatedLocation.heading,
      progressPercentage: computedPercentage,
      status: shipment.status,
      isSimulated: true
    });

    res.status(200).json({
      success: true,
      message: `Simulation advanced to step ${nextStep}/${totalSteps} (${computedPercentage}%).`,
      data: {
        trackingNumber: shipment.trackingNumber,
        trackingSource: 'simulation',
        currentStep: nextStep,
        totalSteps,
        progressPercentage: computedPercentage,
        currentLocation: shipment.currentCoordinates,
        speed: simulatedLocation.speed,
        heading: simulatedLocation.heading
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Reset simulation back to start (Origin)
 * @route POST /api/shipments/:id/simulation/reset
 */
const resetSimulation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Shipment not found'
      });
    }

    shipment.trackingSource = 'simulation';
    shipment.progressPercentage = 0;
    shipment.status = 'created';
    shipment.statusReason = 'Simulation reset to origin.';
    shipment.simulationConfig.currentStep = 0;
    shipment.simulationConfig.lastCalculatedAt = new Date();
    shipment.currentCoordinates = {
      lat: shipment.origin.coordinates.lat,
      lng: shipment.origin.coordinates.lng,
      address: shipment.origin.address,
      city: shipment.origin.city,
      country: shipment.origin.country,
      updatedAt: new Date()
    };

    await shipment.save();

    // Reset all checkpoints to pending
    await ShipmentCheckpoint.updateMany({ shipment: shipment._id }, { status: 'pending', actualArrival: null });

    // Clean simulation locations
    await ShipmentLocation.deleteMany({ shipment: shipment._id, source: 'simulation' });

    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:status_changed', {
      trackingNumber: shipment.trackingNumber,
      trackingSource: 'simulation',
      newStatus: 'created',
      statusTitle: 'Simulation Reset',
      description: 'Shipment simulation reset to origin.',
      progressPercentage: 0,
      currentLocation: shipment.currentCoordinates
    });

    res.status(200).json({
      success: true,
      message: 'Simulation reset back to origin (0%).',
      data: {
        trackingNumber: shipment.trackingNumber,
        progressPercentage: 0,
        currentLocation: shipment.currentCoordinates
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  configureSimulation,
  advanceSimulationStep,
  resetSimulation
};

