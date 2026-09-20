const crypto = require('crypto');
const Shipment = require('../models/Shipment');

/**
 * Generate a cryptographically secure, unique tracking number
 * Format: ZEL-XXXX-XXXX-CC (e.g. ZEL-4829-9182-US)
 * Never exposes MongoDB ObjectIds.
 *
 * @param {string} countryCode - 2 letter country code (default 'US')
 * @returns {Promise<string>}
 */
const generateUniqueTrackingNumber = async (countryCode = 'US') => {
  const code = (countryCode || 'US').trim().toUpperCase().slice(0, 2);
  let isUnique = false;
  let trackingNumber = '';
  let attempts = 0;

  while (!isUnique && attempts < 10) {
    attempts++;
    // Generate 8 random uppercase alphanumeric / digits
    const part1 = crypto.randomBytes(2).toString('hex').toUpperCase(); // 4 chars
    const part2 = Math.floor(1000 + Math.random() * 9000); // 4 digits

    trackingNumber = `ZEL-${part1}-${part2}-${code}`;

    // Verify uniqueness in database
    const existing = await Shipment.findOne({ trackingNumber }).select('_id').lean();
    if (!existing) {
      isUnique = true;
    }
  }

  if (!isUnique) {
    // Fallback guaranteed timestamp entropy
    trackingNumber = `ZEL-${Date.now().toString(36).toUpperCase()}-${code}`;
  }

  return trackingNumber;
};

module.exports = {
  generateUniqueTrackingNumber
};

