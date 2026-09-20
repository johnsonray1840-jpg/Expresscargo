/**
 * Global City & Country Geocoding & Coordinate Resolver
 * Provides reliable, instant offline coordinates for major global countries, states, trade ports and cities.
 */

const GLOBAL_CITY_COORDINATES = {
  // Countries & Major Territories (Direct Country Names)
  'germany': { lat: 51.1657, lng: 10.4515, country: 'Germany' },
  'deutschland': { lat: 51.1657, lng: 10.4515, country: 'Germany' },
  'america': { lat: 37.0902, lng: -95.7129, country: 'United States' },
  'united states': { lat: 37.0902, lng: -95.7129, country: 'United States' },
  'united states of america': { lat: 37.0902, lng: -95.7129, country: 'United States' },
  'usa': { lat: 37.0902, lng: -95.7129, country: 'United States' },
  'us': { lat: 37.0902, lng: -95.7129, country: 'United States' },
  'dubai': { lat: 25.2048, lng: 55.2708, country: 'United Arab Emirates' },
  'uae': { lat: 23.4241, lng: 53.8478, country: 'United Arab Emirates' },
  'united arab emirates': { lat: 23.4241, lng: 53.8478, country: 'United Arab Emirates' },
  'uk': { lat: 55.3781, lng: -3.4360, country: 'United Kingdom' },
  'united kingdom': { lat: 55.3781, lng: -3.4360, country: 'United Kingdom' },
  'great britain': { lat: 55.3781, lng: -3.4360, country: 'United Kingdom' },
  'england': { lat: 52.3555, lng: -1.1743, country: 'United Kingdom' },
  'france': { lat: 46.2276, lng: 2.2137, country: 'France' },
  'italy': { lat: 41.8719, lng: 12.5674, country: 'Italy' },
  'spain': { lat: 40.4637, lng: -3.7492, country: 'Spain' },
  'canada': { lat: 56.1304, lng: -106.3468, country: 'Canada' },
  'china': { lat: 35.8617, lng: 104.1954, country: 'China' },
  'japan': { lat: 36.2048, lng: 138.2529, country: 'Japan' },
  'australia': { lat: -25.2744, lng: 133.7751, country: 'Australia' },
  'india': { lat: 20.5937, lng: 78.9629, country: 'India' },
  'netherlands': { lat: 52.1326, lng: 5.2913, country: 'Netherlands' },
  'holland': { lat: 52.1326, lng: 5.2913, country: 'Netherlands' },
  'belgium': { lat: 50.5039, lng: 4.4699, country: 'Belgium' },
  'switzerland': { lat: 46.8182, lng: 8.2275, country: 'Switzerland' },
  'austria': { lat: 47.5162, lng: 14.5501, country: 'Austria' },
  'sweden': { lat: 60.1282, lng: 18.6435, country: 'Sweden' },
  'norway': { lat: 60.4720, lng: 8.4689, country: 'Norway' },
  'denmark': { lat: 56.2639, lng: 9.5018, country: 'Denmark' },
  'finland': { lat: 61.9241, lng: 25.7482, country: 'Finland' },
  'poland': { lat: 51.9194, lng: 19.1451, country: 'Poland' },
  'portugal': { lat: 39.3999, lng: -8.2245, country: 'Portugal' },
  'ireland': { lat: 53.1424, lng: -7.6921, country: 'Ireland' },
  'turkey': { lat: 38.9637, lng: 35.2433, country: 'Turkey' },
  'russia': { lat: 61.5240, lng: 105.3188, country: 'Russia' },
  'saudi arabia': { lat: 23.8859, lng: 45.0792, country: 'Saudi Arabia' },
  'qatar': { lat: 25.3548, lng: 51.1839, country: 'Qatar' },
  'kuwait': { lat: 29.3117, lng: 47.4818, country: 'Kuwait' },
  'singapore': { lat: 1.3521, lng: 103.8198, country: 'Singapore' },
  'south africa': { lat: -30.5595, lng: 22.9375, country: 'South Africa' },
  'nigeria': { lat: 9.0820, lng: 8.6753, country: 'Nigeria' },
  'ghana': { lat: 7.9465, lng: -1.0232, country: 'Ghana' },
  'kenya': { lat: -0.0236, lng: 37.9062, country: 'Kenya' },
  'egypt': { lat: 26.8206, lng: 30.8025, country: 'Egypt' },
  'brazil': { lat: -14.2350, lng: -51.9253, country: 'Brazil' },
  'mexico': { lat: 23.6345, lng: -102.5528, country: 'Mexico' },
  'argentina': { lat: -38.4161, lng: -63.6167, country: 'Argentina' },
  'new zealand': { lat: -40.9006, lng: 174.8860, country: 'New Zealand' },
  'philippines': { lat: 12.8797, lng: 121.7740, country: 'Philippines' },
  'thailand': { lat: 15.8700, lng: 100.9925, country: 'Thailand' },
  'malaysia': { lat: 4.2105, lng: 101.9758, country: 'Malaysia' },
  'indonesia': { lat: -0.7893, lng: 113.9213, country: 'Indonesia' },
  'south korea': { lat: 35.9078, lng: 127.7669, country: 'South Korea' },
  'korea': { lat: 35.9078, lng: 127.7669, country: 'South Korea' },
  'israel': { lat: 31.0461, lng: 34.8516, country: 'Israel' },
  'greece': { lat: 39.0742, lng: 21.8243, country: 'Greece' },

  // US States & Regions
  'california': { lat: 36.7783, lng: -119.4179, country: 'United States' },
  'texas': { lat: 31.9686, lng: -99.9018, country: 'United States' },
  'florida': { lat: 27.6648, lng: -81.5158, country: 'United States' },
  'new york state': { lat: 40.7128, lng: -74.0060, country: 'United States' },
  'illinois': { lat: 40.6331, lng: -89.3985, country: 'United States' },
  'washington': { lat: 47.7511, lng: -120.7401, country: 'United States' },
  'georgia': { lat: 32.1656, lng: -82.9001, country: 'United States' },

  // Major World Cities & Commercial Gateways
  // Western & Central Europe
  'frankfurt': { lat: 50.1109, lng: 8.6821, country: 'Germany' },
  'berlin': { lat: 52.5200, lng: 13.4050, country: 'Germany' },
  'munich': { lat: 48.1351, lng: 11.5820, country: 'Germany' },
  'hamburg': { lat: 53.5511, lng: 9.9937, country: 'Germany' },
  'cologne': { lat: 50.9375, lng: 6.9603, country: 'Germany' },
  'dusseldorf': { lat: 51.2277, lng: 6.7735, country: 'Germany' },
  'stuttgart': { lat: 48.7758, lng: 9.1829, country: 'Germany' },
  'london': { lat: 51.5074, lng: -0.1278, country: 'United Kingdom' },
  'manchester': { lat: 53.4808, lng: -2.2426, country: 'United Kingdom' },
  'birmingham': { lat: 52.4862, lng: -1.8904, country: 'United Kingdom' },
  'paris': { lat: 48.8566, lng: 2.3522, country: 'France' },
  'marseille': { lat: 43.2965, lng: 5.3698, country: 'France' },
  'lyon': { lat: 45.7640, lng: 4.8357, country: 'France' },
  'amsterdam': { lat: 52.3676, lng: 4.9041, country: 'Netherlands' },
  'rotterdam': { lat: 51.9244, lng: 4.4777, country: 'Netherlands' },
  'brussels': { lat: 50.8503, lng: 4.3517, country: 'Belgium' },
  'antwerp': { lat: 51.2194, lng: 4.4025, country: 'Belgium' },
  'zurich': { lat: 47.3769, lng: 8.5417, country: 'Switzerland' },
  'geneva': { lat: 46.2044, lng: 6.1432, country: 'Switzerland' },
  'vienna': { lat: 48.2082, lng: 16.3738, country: 'Austria' },
  'madrid': { lat: 40.4168, lng: -3.7038, country: 'Spain' },
  'barcelona': { lat: 41.3851, lng: 2.1734, country: 'Spain' },
  'valencia': { lat: 39.4699, lng: -0.3763, country: 'Spain' },
  'rome': { lat: 41.9028, lng: 12.4964, country: 'Italy' },
  'milan': { lat: 45.4642, lng: 9.1900, country: 'Italy' },
  'lisbon': { lat: 38.7223, lng: -9.1393, country: 'Portugal' },
  'porto': { lat: 41.1579, lng: -8.6291, country: 'Portugal' },
  'dublin': { lat: 53.3498, lng: -6.2603, country: 'Ireland' },
  'stockholm': { lat: 59.3293, lng: 18.0686, country: 'Sweden' },
  'oslo': { lat: 59.9139, lng: 10.7522, country: 'Norway' },
  'copenhagen': { lat: 55.6761, lng: 12.5683, country: 'Denmark' },
  'helsinki': { lat: 60.1699, lng: 24.9384, country: 'Finland' },
  'warsaw': { lat: 52.2297, lng: 21.0122, country: 'Poland' },
  'prague': { lat: 50.0755, lng: 14.4378, country: 'Czech Republic' },
  'budapest': { lat: 47.4979, lng: 19.0402, country: 'Hungary' },
  'athens': { lat: 37.9838, lng: 23.7275, country: 'Greece' },

  // North America
  'new york': { lat: 40.7128, lng: -74.0060, country: 'United States' },
  'los angeles': { lat: 34.0522, lng: -118.2437, country: 'United States' },
  'chicago': { lat: 41.8781, lng: -87.6298, country: 'United States' },
  'houston': { lat: 29.7604, lng: -95.3698, country: 'United States' },
  'miami': { lat: 25.7617, lng: -80.1918, country: 'United States' },
  'san francisco': { lat: 37.7749, lng: -122.4194, country: 'United States' },
  'seattle': { lat: 47.6062, lng: -122.3321, country: 'United States' },
  'atlanta': { lat: 33.7490, lng: -84.3880, country: 'United States' },
  'dallas': { lat: 32.7767, lng: -96.7970, country: 'United States' },
  'boston': { lat: 42.3601, lng: -71.0589, country: 'United States' },
  'washington dc': { lat: 38.9072, lng: -77.0369, country: 'United States' },
  'philadelphia': { lat: 39.9526, lng: -75.1652, country: 'United States' },
  'phoenix': { lat: 33.4484, lng: -112.0740, country: 'United States' },
  'san diego': { lat: 32.7157, lng: -117.1611, country: 'United States' },
  'las vegas': { lat: 36.1699, lng: -115.1398, country: 'United States' },
  'denver': { lat: 39.7392, lng: -104.9903, country: 'United States' },
  'toronto': { lat: 43.6532, lng: -79.3832, country: 'Canada' },
  'vancouver': { lat: 49.2827, lng: -123.1207, country: 'Canada' },
  'montreal': { lat: 45.5017, lng: -73.5673, country: 'Canada' },
  'calgary': { lat: 51.0447, lng: -114.0719, country: 'Canada' },
  'mexico city': { lat: 19.4326, lng: -99.1332, country: 'Mexico' },
  'guadalajara': { lat: 20.6597, lng: -103.3496, country: 'Mexico' },

  // Middle East & Africa
  'abu dhabi': { lat: 24.4539, lng: 54.3773, country: 'United Arab Emirates' },
  'sharjah': { lat: 25.3463, lng: 55.4209, country: 'United Arab Emirates' },
  'doha': { lat: 25.2854, lng: 51.5310, country: 'Qatar' },
  'riyadh': { lat: 24.7136, lng: 46.6753, country: 'Saudi Arabia' },
  'jeddah': { lat: 21.4858, lng: 39.1925, country: 'Saudi Arabia' },
  'dammam': { lat: 26.4207, lng: 50.0888, country: 'Saudi Arabia' },
  'cairo': { lat: 30.0444, lng: 31.2357, country: 'Egypt' },
  'alexandria': { lat: 31.2001, lng: 29.9187, country: 'Egypt' },
  'istanbul': { lat: 41.0082, lng: 28.9784, country: 'Turkey' },
  'ankara': { lat: 39.9334, lng: 32.8597, country: 'Turkey' },
  'johannesburg': { lat: -26.2041, lng: 28.0473, country: 'South Africa' },
  'cape town': { lat: -33.9249, lng: 18.4241, country: 'South Africa' },
  'durban': { lat: -29.8587, lng: 31.0218, country: 'South Africa' },
  'nairobi': { lat: -1.2921, lng: 36.8219, country: 'Kenya' },
  'mombasa': { lat: -4.0435, lng: 39.6682, country: 'Kenya' },
  'lagos': { lat: 6.5244, lng: 3.3792, country: 'Nigeria' },
  'abuja': { lat: 9.0765, lng: 7.3986, country: 'Nigeria' },
  'accra': { lat: 5.6037, lng: -0.1870, country: 'Ghana' },
  'casablanca': { lat: 33.5731, lng: -7.5898, country: 'Morocco' },
  'tunis': { lat: 36.8065, lng: 10.1815, country: 'Tunisia' },
  'addis ababa': { lat: 9.0300, lng: 38.7400, country: 'Ethiopia' },

  // Asia Pacific
  'tokyo': { lat: 35.6762, lng: 139.6503, country: 'Japan' },
  'osaka': { lat: 34.6937, lng: 135.5023, country: 'Japan' },
  'nagoya': { lat: 35.1815, lng: 136.9066, country: 'Japan' },
  'hong kong': { lat: 22.3193, lng: 114.1694, country: 'Hong Kong' },
  'shanghai': { lat: 31.2304, lng: 121.4737, country: 'China' },
  'beijing': { lat: 39.9042, lng: 116.4074, country: 'China' },
  'shenzhen': { lat: 22.5431, lng: 114.0579, country: 'China' },
  'guangzhou': { lat: 23.1291, lng: 113.2644, country: 'China' },
  'seoul': { lat: 37.5665, lng: 126.9780, country: 'South Korea' },
  'incheon': { lat: 37.4563, lng: 126.7052, country: 'South Korea' },
  'taipei': { lat: 25.0330, lng: 121.5654, country: 'Taiwan' },
  'mumbai': { lat: 19.0760, lng: 72.8777, country: 'India' },
  'delhi': { lat: 28.6139, lng: 77.2090, country: 'India' },
  'new delhi': { lat: 28.6139, lng: 77.2090, country: 'India' },
  'bangalore': { lat: 12.9716, lng: 77.5946, country: 'India' },
  'chennai': { lat: 13.0827, lng: 80.2707, country: 'India' },
  'hyderabad': { lat: 17.3850, lng: 78.4867, country: 'India' },
  'kolkata': { lat: 22.5726, lng: 88.3639, country: 'India' },
  'bangkok': { lat: 13.7563, lng: 100.5018, country: 'Thailand' },
  'kuala lumpur': { lat: 3.1390, lng: 101.6869, country: 'Malaysia' },
  'jakarta': { lat: -6.2088, lng: 106.8456, country: 'Indonesia' },
  'manila': { lat: 14.5995, lng: 120.9842, country: 'Philippines' },
  'sydney': { lat: -33.8688, lng: 151.2093, country: 'Australia' },
  'melbourne': { lat: -37.8136, lng: 144.9631, country: 'Australia' },
  'brisbane': { lat: -27.4698, lng: 153.0251, country: 'Australia' },
  'perth': { lat: -31.9505, lng: 115.8605, country: 'Australia' },
  'auckland': { lat: -36.8485, lng: 174.7633, country: 'New Zealand' },

  // South America
  'sao paulo': { lat: -23.5505, lng: -46.6333, country: 'Brazil' },
  'rio de janeiro': { lat: -22.9068, lng: -43.1729, country: 'Brazil' },
  'brasilia': { lat: -15.8267, lng: -47.9218, country: 'Brazil' },
  'buenos aires': { lat: -34.6037, lng: -58.3816, country: 'Argentina' },
  'santiago': { lat: -33.4489, lng: -70.6693, country: 'Chile' },
  'bogota': { lat: 4.7110, lng: -74.0721, country: 'Colombia' },
  'lima': { lat: -12.0464, lng: -77.0428, country: 'Peru' },
  'caracas': { lat: 10.4806, lng: -66.9036, country: 'Venezuela' }
};

/**
 * Resolve location/city/country string to coordinate object
 * @param {string} locationStr
 * @param {object} defaultCoords
 * @returns {{lat: number, lng: number}}
 */
function resolveCityCoordinates(locationStr, defaultCoords = { lat: 51.1657, lng: 10.4515 }) {
  if (!locationStr || typeof locationStr !== 'string') return defaultCoords;
  const clean = locationStr.toLowerCase().replace(/[,.\-_]/g, ' ').trim();
  
  // 1. Direct exact key match
  if (GLOBAL_CITY_COORDINATES[clean]) {
    return {
      lat: GLOBAL_CITY_COORDINATES[clean].lat,
      lng: GLOBAL_CITY_COORDINATES[clean].lng
    };
  }

  // 2. Word by word and substring search
  const words = clean.split(/\s+/).filter(Boolean);
  for (const word of words) {
    if (GLOBAL_CITY_COORDINATES[word]) {
      return {
        lat: GLOBAL_CITY_COORDINATES[word].lat,
        lng: GLOBAL_CITY_COORDINATES[word].lng
      };
    }
  }

  // 3. Substring match across all known keys
  for (const [key, coords] of Object.entries(GLOBAL_CITY_COORDINATES)) {
    if (clean.includes(key) || key.includes(clean)) {
      return { lat: coords.lat, lng: coords.lng };
    }
  }

  return {
    lat: null,
    lng: null
  };
}

module.exports = {
  GLOBAL_CITY_COORDINATES,
  resolveCityCoordinates
};
