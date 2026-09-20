/**
 * Lightweight production logger
 * Designed for low resource overhead on shared hosting
 */
const isDev = process.env.NODE_ENV !== 'production';

const logger = {
  info: (message, meta = '') => {
    console.log(`[INFO] [${new Date().toISOString()}] ${message}`, meta ? meta : '');
  },
  warn: (message, meta = '') => {
    console.warn(`[WARN] [${new Date().toISOString()}] ${message}`, meta ? meta : '');
  },
  error: (message, error = '') => {
    console.error(`[ERROR] [${new Date().toISOString()}] ${message}`, error ? error : '');
  },
  debug: (message, meta = '') => {
    if (isDev) {
      console.debug(`[DEBUG] [${new Date().toISOString()}] ${message}`, meta ? meta : '');
    }
  }
};

module.exports = logger;

