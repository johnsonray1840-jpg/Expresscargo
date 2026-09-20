const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { registerSocketHandlers } = require('../sockets/socketHandler');
const logger = require('../utils/logger');

let io = null;

/**
 * Initialize Socket.IO with polling fallback for cPanel/shared hosting proxies
 * @param {import('http').Server} httpServer
 */
const initSocket = (httpServer) => {
  const allowedOrigins = (process.env.CLIENT_URL || '*').split(',').map(s => s.trim());

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      credentials: true
    },
    transports: ['polling', 'websocket'],
    pingTimeout: 30000,
    pingInterval: 25000
  });

  // Socket authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        socket.user = decoded;
      } catch (err) {
        logger.debug('Socket client connected without auth session');
      }
    }
    next();
  });

  io.on('connection', registerSocketHandlers);

  logger.info('Socket.IO initialized successfully (polling + websocket transports with auth guards)');
  return io;
};

/**
 * Get active Socket.IO instance
 */
const getIO = () => {
  if (!io) {
    logger.warn('Socket.IO requested before initialization');
  }
  return io;
};

/**
 * Broadcast shipment update to subscribed clients and admin fleet
 */
const broadcastShipmentUpdate = (trackingNumber, event, payload) => {
  if (!io) return;
  const room = `tracking:${trackingNumber.trim().toUpperCase()}`;
  io.to(room).emit(event, payload);
  io.to('admin_fleet_feed').emit(event, { trackingNumber, ...payload });
};

/**
 * Emit real-time notification to a specific user
 */
const sendRealTimeNotification = (userId, notification) => {
  if (!io || !userId) return;
  const userRoom = `user:${userId.toString().trim()}`;
  io.to(userRoom).emit('notification:new', notification);
};

module.exports = {
  initSocket,
  getIO,
  broadcastShipmentUpdate,
  sendRealTimeNotification
};
