/**
 * High-Accuracy Global Geocoding Service with Real-Time Online Geocoding Fallback
 * 1. Checks exact dictionary of major world countries, states, and key hub cities.
 * 2. If not matched, queries OpenStreetMap Nominatim Live Geocoding API (Zero API Key required).
 * 3. Falls back smoothly to comprehensive local dictionary.
 */

const https = require('https');
const http = require('http');
const { GLOBAL_CITY_COORDINATES } = require('./cityCoordinates');
const logger = require('./logger');

// In-memory geocode cache to prevent redundant external API lookups
const geocodeCache = new Map();

/**
 * Fetch live GPS coordinates for any address, city, state, or country string
 * @param {string} addressStr
 * @returns {Promise<{lat: number, lng: number, displayName?: string}>}
 */
async function geocodeAddressOnline(addressStr) {
  if (!addressStr || typeof addressStr !== 'string') {
    return null;
  }

  const query = addressStr.trim();
  if (!query) return null;

  const cacheKey = query.toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  // 1. Direct match in our high-density dictionary first for instant speed
  const cleanKey = cacheKey.replace(/[,.\-_]/g, ' ').replace(/\s+/g, ' ').trim();
  if (GLOBAL_CITY_COORDINATES[cleanKey]) {
    const res = {
      lat: GLOBAL_CITY_COORDINATES[cleanKey].lat,
      lng: GLOBAL_CITY_COORDINATES[cleanKey].lng,
      displayName: GLOBAL_CITY_COORDINATES[cleanKey].country || query
    };
    geocodeCache.set(cacheKey, res);
    return res;
  }

  // 2. Perform live Nominatim search with timeout
  return new Promise((resolve) => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`;
      
      const req = https.get(
        url,
        {
          headers: {
            'User-Agent': 'ExpressCargoLogistics/2.0 (dispatch@express-cargo.ltd)'
          },
          timeout: 4000
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              if (res.statusCode === 200 && data) {
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  const lat = parseFloat(parsed[0].lat);
                  const lng = parseFloat(parsed[0].lon);
                  if (!isNaN(lat) && !isNaN(lng)) {
                    const result = {
                      lat: Number(lat.toFixed(6)),
                      lng: Number(lng.toFixed(6)),
                      displayName: parsed[0].display_name
                    };
                    geocodeCache.set(cacheKey, result);
                    return resolve(result);
                  }
                }
              }
            } catch (err) {
              // Ignore parse error and fallback
            }
            resolve(null);
          });
        }
      );

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    } catch (err) {
      resolve(null);
    }
  });
}

/**
 * Synchronous resolver with dictionary + deterministic fallback
 * @param {string} locationStr
 * @param {object} defaultCoords
 * @returns {{lat: number, lng: number}}
 */
function resolveLocationCoordinatesSync(locationStr, defaultCoords = { lat: 51.1657, lng: 10.4515 }) {
  if (!locationStr || typeof locationStr !== 'string') return defaultCoords;
  const clean = locationStr.toLowerCase().replace(/[,.\-_]/g, ' ').replace(/\s+/g, ' ').trim();

  if (geocodeCache.has(clean)) {
    const cached = geocodeCache.get(clean);
    return { lat: cached.lat, lng: cached.lng };
  }

  if (GLOBAL_CITY_COORDINATES[clean]) {
    return {
      lat: GLOBAL_CITY_COORDINATES[clean].lat,
      lng: GLOBAL_CITY_COORDINATES[clean].lng
    };
  }

  const words = clean.split(/\s+/).filter(Boolean);
  for (const word of words) {
    if (GLOBAL_CITY_COORDINATES[word]) {
      return {
        lat: GLOBAL_CITY_COORDINATES[word].lat,
        lng: GLOBAL_CITY_COORDINATES[word].lng
      };
    }
  }

  for (const [key, coords] of Object.entries(GLOBAL_CITY_COORDINATES)) {
    if (clean.includes(key) || key.includes(clean)) {
      return { lat: coords.lat, lng: coords.lng };
    }
  }

  return defaultCoords;
}

/**
 * Smart resolver: tries online geocoding first, then falls back to sync resolver
 * @param {string} locationStr
 * @param {object} defaultCoords
 * @returns {Promise<{lat: number, lng: number}>}
 */
async function resolveLocationCoordinatesAsync(locationStr, defaultCoords = { lat: 51.1657, lng: 10.4515 }) {
  if (!locationStr || typeof locationStr !== 'string') return defaultCoords;
  
  const online = await geocodeAddressOnline(locationStr);
  if (online && online.lat != null && online.lng != null) {
    return { lat: online.lat, lng: online.lng };
  }

  return resolveLocationCoordinatesSync(locationStr, defaultCoords);
}

module.exports = {
  geocodeAddressOnline,
  resolveLocationCoordinatesSync,
  resolveLocationCoordinatesAsync,
  geocodeCache
};

