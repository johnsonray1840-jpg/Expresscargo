const express = require('express');
const router = express.Router();
const {
  getPublicTrackingInfo,
  getLocationHistory,
  verifyTrackingNumber,
  subscribeTrackingEmail
} = require('../controllers/trackingController');
const { trackingLimiter } = require('../middleware/rateLimiter');

// Rate-limited public tracking verification
router.get('/verify/:trackingNumber', trackingLimiter, verifyTrackingNumber);

// Subscribe email to tracking milestone alerts
router.post('/:trackingNumber/subscribe', trackingLimiter, subscribeTrackingEmail);

// Paginated location history endpoint (Section 34)
router.get('/:trackingNumber/locations', trackingLimiter, getLocationHistory);

// Full map and telemetry tracking info
router.get('/:trackingNumber', trackingLimiter, getPublicTrackingInfo);

module.exports = router;
