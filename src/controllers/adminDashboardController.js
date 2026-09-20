const { Shipment, User, Package, ShipmentEvent } = require('../models');
const logger = require('../utils/logger');

// Lightweight In-Memory Stats Cache with 15-second TTL to eliminate database load on dashboard refreshes
let cachedDashboardStats = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 15 * 1000; // 15 seconds

/**
 * Helper to compute or retrieve cached dashboard statistics
 */
const computeDashboardStats = async (forceRefresh = false) => {
  const now = Date.now();
  if (cachedDashboardStats && !forceRefresh && (now - lastCacheTime < CACHE_TTL_MS)) {
    return { ...cachedDashboardStats, fromCache: true };
  }

  // Active status whitelist
  const activeStatuses = [
    'created',
    'awaiting_pickup',
    'picked_up',
    'processing',
    'in_transit',
    'at_facility',
    'customs_processing',
    'customs_clearance',
    'out_for_delivery',
    'delayed',
    'held'
  ];

  // Run single-pass status grouping aggregation + customer count in parallel
  const [statusAggregation, totalCustomers, totalPackages] = await Promise.all([
    Shipment.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]),
    User.countDocuments({ role: 'customer' }),
    Package.countDocuments()
  ]);

  // Convert aggregation array to key-value status map
  const statusMap = {};
  let totalShipments = 0;
  let activeShipments = 0;

  statusAggregation.forEach((item) => {
    const status = item._id || 'unknown';
    const count = item.count || 0;
    statusMap[status] = count;
    totalShipments += count;

    if (activeStatuses.includes(status)) {
      activeShipments += count;
    }
  });

  const stats = {
    totalShipments,
    activeShipments,
    inTransit: statusMap['in_transit'] || 0,
    delivered: statusMap['delivered'] || 0,
    delayed: statusMap['delayed'] || 0,
    paused: statusMap['paused'] || 0,
    suspended: statusMap['suspended'] || 0,
    cancelled: statusMap['cancelled'] || 0,
    confiscated: statusMap['confiscated'] || 0,
    totalCustomers,
    totalPackages,
    statusBreakdown: statusMap,
    cachedAt: new Date().toISOString()
  };

  cachedDashboardStats = stats;
  lastCacheTime = now;

  return { ...stats, fromCache: false };
};

/**
 * Invalidate the in-memory stats cache (called when shipment status changes)
 */
const invalidateDashboardCache = () => {
  cachedDashboardStats = null;
  lastCacheTime = 0;
};

/**
 * @desc    Get Admin Dashboard Statistics
 * @route   GET /api/admin/dashboard/stats
 * @access  Private/Admin
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const force = req.query.fresh === 'true';
    const stats = await computeDashboardStats(force);

    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get dashboard stats:', error);
    next(error);
  }
};

/**
 * @desc    Get Recent Shipments
 * @route   GET /api/admin/dashboard/recent-shipments
 * @access  Private/Admin
 */
const getRecentShipments = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);

    const recentShipments = await Shipment.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('trackingNumber referenceNumber status progressPercentage origin destination sender recipient estimatedDeliveryDate durationConfig trackingSource createdAt')
      .lean();

    return res.status(200).json({
      success: true,
      data: recentShipments,
      count: recentShipments.length
    });
  } catch (error) {
    logger.error('Failed to get recent shipments:', error);
    next(error);
  }
};

/**
 * @desc    Get Complete Dashboard Overview (Stats + Recent Shipments + Timeline Activity)
 * @route   GET /api/admin/dashboard/overview
 * @access  Private/Admin
 */
const getDashboardOverview = async (req, res, next) => {
  try {
    const force = req.query.fresh === 'true';
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 20);

    const [stats, recentShipments, recentEvents] = await Promise.all([
      computeDashboardStats(force),
      Shipment.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('trackingNumber status progressPercentage origin destination sender recipient estimatedDeliveryDate createdAt')
        .lean(),
      ShipmentEvent.find()
        .sort({ timestamp: -1 })
        .limit(8)
        .populate('actor', 'name email role')
        .lean()
    ]);

    return res.status(200).json({
      success: true,
      data: {
        stats,
        recentShipments,
        recentEvents,
        serverTime: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get dashboard overview:', error);
    next(error);
  }
};

module.exports = {
  getDashboardStats,
  getRecentShipments,
  getDashboardOverview,
  invalidateDashboardCache
};

