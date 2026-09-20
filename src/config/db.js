const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Connect to MongoDB Atlas with settings optimized for cPanel / Shared Hosting
 * Uses connection pool constraints to keep memory usage under tight quotas.
 */
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      logger.warn('MONGODB_URI not found in environment. Database connection skipped.');
      return null;
    }

    const options = {
      maxPoolSize: 10, // Maintain up to 10 socket connections (ideal for low-RAM shared hosting)
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      autoIndex: process.env.NODE_ENV !== 'production' // Don't build indexes in production per-request
    };

    const conn = await mongoose.connect(mongoUri, options);
    logger.info(`MongoDB Atlas Connected: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Reconnection will be handled automatically.');
    });

    return conn;
  } catch (error) {
    logger.error('Failed to connect to MongoDB Atlas:', error.message);
    // Do not crash server in dev, but log cleanly
    if (process.env.NODE_ENV === 'production') {
      logger.warn('Production server running in offline DB mode until connection recovers.');
    }
  }
};

module.exports = connectDB;

