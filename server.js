require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { initSocket } = require('./src/config/socket');
const logger = require('./src/utils/logger');
const { initCronJobs } = require('./src/utils/cronJobs');

// Create HTTP server
const server = http.createServer(app);

// Connect to MongoDB Atlas
connectDB();

// Initialize Socket.IO with polling + websocket fallback
initSocket(server);

// Initialize Automated Milestone Background Workflow
initCronJobs();

// Port Configuration
const PORT = parseInt(process.env.PORT || '5000', 10);

if (require.main === module) {
  server.listen(PORT, () => {
    logger.info(`Express Cargo Backend running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
}

// Graceful Rejection and Exception Handlers
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

// Graceful Shutdown on Shared Hosting / Passenger SIGTERM
const gracefulShutdown = () => {
  logger.info('Gracefully shutting down server...');
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = { app, server };
