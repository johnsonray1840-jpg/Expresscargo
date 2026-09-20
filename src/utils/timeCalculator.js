/**
 * Server-side Shipment Time & Duration Progression Calculator
 * Progress is computed strictly server-side using immutable timestamps.
 */

const PRESET_HOURS_MAP = {
  '1h': 1,
  '2h': 2,
  '6h': 6,
  '12h': 12,
  '1d': 24,
  '2d': 48,
  '3d': 72,
  '1w': 168, // 7 * 24
  '2w': 336, // 14 * 24
  '1m': 720, // 30 * 24
  indefinite: 0
};

/**
 * 6-Stage Consignment Lifecycle Milestones definition
 */
const LIFECYCLE_STAGES = [
  {
    step: 1,
    id: 'booked',
    name: 'Booked',
    subtitle: 'Manifest Issued & Registered',
    threshold: 0,
    statusKey: 'created',
    description: 'Consignment manifest generated and entered into global cargo dispatch ledger.'
  },
  {
    step: 2,
    id: 'hub_intake',
    name: 'Hub Intake',
    subtitle: 'Sorted & Sealed',
    threshold: 15,
    statusKey: 'picked_up',
    description: 'Cargo received at origin international gateway hub, screened, and sealed with tamper-proof seal.'
  },
  {
    step: 3,
    id: 'in_transit',
    name: 'In Transit',
    subtitle: 'Global Air/Sea En Route',
    threshold: 30,
    statusKey: 'in_transit',
    description: 'Consignment loaded onto international transport carrier and actively cruising along assigned flight corridor.'
  },
  {
    step: 4,
    id: 'customs_clearance',
    name: 'Customs Clearance',
    subtitle: 'Customs & Regulatory Clearance',
    threshold: 70,
    statusKey: 'customs_clearance',
    description: 'Arrival at destination port; documents verified, import duties cleared, and released for final transit.'
  },
  {
    step: 5,
    id: 'out_for_delivery',
    name: 'Out for Delivery',
    subtitle: 'Final Courier Dispatch',
    threshold: 85,
    statusKey: 'out_for_delivery',
    description: 'Handed over to priority regional delivery courier vehicle for final doorstep delivery.'
  },
  {
    step: 6,
    id: 'delivered',
    name: 'Delivered',
    subtitle: 'Signed & Closed',
    threshold: 100,
    statusKey: 'delivered',
    description: 'Consignment successfully delivered to consignee. Digital signature captured and manifest closed.'
  }
];

/**
 * Calculate duration hours from preset or custom values
 */
const parseDurationConfig = ({ preset = '1d', value = null, unit = 'hours', isIndefinite = false }) => {
  if (isIndefinite || preset === 'indefinite') {
    return {
      preset: 'indefinite',
      value: 0,
      unit: 'indefinite',
      durationHours: 0,
      isIndefinite: true
    };
  }

  if (preset && PRESET_HOURS_MAP[preset] !== undefined && preset !== 'custom') {
    const hours = PRESET_HOURS_MAP[preset];
    return {
      preset,
      value: hours,
      unit: preset.endsWith('h') ? 'hours' : preset.endsWith('d') ? 'days' : preset.endsWith('w') ? 'weeks' : 'months',
      durationHours: hours,
      isIndefinite: false
    };
  }

  // Custom unit conversion
  const numVal = Math.max(0.1, Number(value) || 24);
  let computedHours = numVal;

  if (unit === 'days') computedHours = numVal * 24;
  else if (unit === 'weeks') computedHours = numVal * 24 * 7;
  else if (unit === 'months') computedHours = numVal * 24 * 30;

  return {
    preset: 'custom',
    value: numVal,
    unit: unit || 'hours',
    durationHours: Number(computedHours.toFixed(2)),
    isIndefinite: false
  };
};

/**
 * Calculate System ETA algorithmically from startedAt + durationHours + pause adjustments
 */
const calculateSystemETA = (shipment) => {
  if (!shipment) return null;
  if (shipment.durationConfig && shipment.durationConfig.isIndefinite) return null;

  const startTime = new Date(shipment.startedAt || shipment.dispatchDate || shipment.createdAt || Date.now()).getTime();
  const durationMs = (shipment.durationHours || 24) * 60 * 60 * 1000;
  const pauseMs = shipment.pauseDetails ? shipment.pauseDetails.totalPausedDurationMs || 0 : 0;

  return new Date(startTime + durationMs + pauseMs);
};

/**
 * Get effective ETA (Admin manual override takes precedence if set, otherwise systemETA)
 */
const getEffectiveETA = (shipment) => {
  if (!shipment) return null;
  if (shipment.adminETA) return new Date(shipment.adminETA);
  if (shipment.systemETA) return new Date(shipment.systemETA);
  if (shipment.estimatedDeliveryDate) return new Date(shipment.estimatedDeliveryDate);
  if (shipment.expectedDeliveryAt) return new Date(shipment.expectedDeliveryAt);
  return calculateSystemETA(shipment);
};

/**
 * Compute progress percentage purely on the server using timestamp arithmetic
 *
 * @param {object} shipment
 * @returns {number} progress percentage (0 - 100)
 */
const calculateServerProgress = (shipment) => {
  if (!shipment) return 0;

  if (shipment.status === 'delivered' || shipment.deliveredAt || shipment.actualDeliveryDate) {
    return 100;
  }

  if (['cancelled', 'confiscated', 'suspended'].includes(shipment.status)) {
    return shipment.progressPercentage || 0;
  }

  // If indefinite or no end time, retain manual/milestone progress
  if (shipment.durationConfig && shipment.durationConfig.isIndefinite) {
    return shipment.progressPercentage || 10;
  }

  // Only simulate time progression if explicitly started via simulation button
  if (!['in_transit', 'active'].includes(shipment.status) || shipment.trackingSource !== 'simulation') {
    return shipment.progressPercentage || 5;
  }

  const effectiveETA = getEffectiveETA(shipment);
  const startTime = new Date(shipment.startedAt || shipment.dispatchDate || shipment.createdAt || Date.now()).getTime();

  if (!effectiveETA || isNaN(startTime)) {
    return shipment.progressPercentage || 10;
  }

  const etaTime = effectiveETA.getTime();
  if (isNaN(etaTime) || etaTime <= startTime) {
    return shipment.progressPercentage || 10;
  }

  const totalDurationMs = etaTime - startTime;
  const now = Date.now();

  // If paused, freeze elapsed time calculation at pause moment
  let effectiveNow = now;
  if (shipment.status === 'paused' && (shipment.pausedAt || (shipment.pauseDetails && shipment.pauseDetails.pausedAt))) {
    effectiveNow = new Date(shipment.pausedAt || shipment.pauseDetails.pausedAt).getTime();
  }

  // Subtract prior pause durations
  const totalPausedMs = shipment.pauseDetails ? shipment.pauseDetails.totalPausedDurationMs || 0 : 0;
  const elapsedMs = Math.max(0, effectiveNow - startTime - totalPausedMs);

  const rawProgress = (elapsedMs / totalDurationMs) * 100;
  
  if (rawProgress >= 100) {
    return 100;
  }

  // Ensure it doesn't dip below the initial set progress (e.g., 5%)
  const computed = Math.max(0, Math.round(rawProgress));
  return Math.max(computed, shipment.progressPercentage || 0);
};

/**
 * Determine the active milestone stage based on current progress percentage
 */
const calculateMilestoneStage = (progressPercentage = 0, status = 'created') => {
  const p = Math.min(100, Math.max(0, Number(progressPercentage) || 0));
  const cleanStatus = (status || '').toLowerCase();

  if (p >= 100 || cleanStatus === 'delivered') return LIFECYCLE_STAGES[5];
  if (p >= 85 || cleanStatus === 'out_for_delivery') return LIFECYCLE_STAGES[4];
  if (p >= 70 || cleanStatus === 'customs_clearance' || cleanStatus === 'customs_processing') return LIFECYCLE_STAGES[3];
  if (p >= 30 || cleanStatus === 'in_transit' || cleanStatus === 'active') return LIFECYCLE_STAGES[2];
  if (p >= 15 || cleanStatus === 'hub_intake' || cleanStatus === 'picked_up' || cleanStatus === 'processing') return LIFECYCLE_STAGES[1];
  return LIFECYCLE_STAGES[0];
};

/**
 * Calculate Great-Circle (Geodesic) interpolation between origin & destination
 * Returns accurate real-time GPS coordinates and compass heading along flight corridor
 */
const interpolateGreatCirclePosition = (originCoords, destCoords, progressPercentage = 0) => {
  if (!originCoords || !destCoords || originCoords.lat == null || destCoords.lat == null) {
    return {
      lat: originCoords ? originCoords.lat : 0,
      lng: originCoords ? originCoords.lng : 0,
      heading: 0,
      progress: progressPercentage
    };
  }

  const fraction = Math.min(1, Math.max(0, Number(progressPercentage) / 100));
  
  const lat1 = (originCoords.lat * Math.PI) / 180;
  const lon1 = (originCoords.lng * Math.PI) / 180;
  const lat2 = (destCoords.lat * Math.PI) / 180;
  const lon2 = (destCoords.lng * Math.PI) / 180;

  // Angular distance in radians
  const d = 2 * Math.asin(Math.sqrt(
    Math.pow(Math.sin((lat1 - lat2) / 2), 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon1 - lon2) / 2), 2)
  ));

  if (d === 0 || isNaN(d)) {
    return {
      lat: originCoords.lat,
      lng: originCoords.lng,
      heading: 0,
      progress: progressPercentage
    };
  }

  const A = Math.sin((1 - fraction) * d) / Math.sin(d);
  const B = Math.sin(fraction * d) / Math.sin(d);

  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);

  const latRad = Math.atan2(z, Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)));
  const lonRad = Math.atan2(y, x);

  const lat = (latRad * 180) / Math.PI;
  const lng = (lonRad * 180) / Math.PI;

  // Calculate compass bearing
  const yBearing = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const xBearing = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  let bearing = (Math.atan2(yBearing, xBearing) * 180) / Math.PI;
  bearing = (bearing + 360) % 360;

  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    heading: Math.round(bearing),
    progress: progressPercentage
  };
};

module.exports = {
  PRESET_HOURS_MAP,
  LIFECYCLE_STAGES,
  parseDurationConfig,
  calculateSystemETA,
  getEffectiveETA,
  calculateServerProgress,
  calculateMilestoneStage,
  interpolateGreatCirclePosition
};
