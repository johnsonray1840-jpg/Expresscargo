const logger = require('../utils/logger');

/**
 * Register all Socket.IO client event handlers
 * @param {import('socket.io').Socket} socket 
 */
const registerSocketHandlers = (socket) => {
  logger.debug(`Socket client connected: ${socket.id} (Auth: ${Boolean(socket.user)})`);

  // Public: Join tracking room
  socket.on('join_tracking', (trackingNumber) => {
    if (trackingNumber) {
      const room = `tracking:${trackingNumber.trim().toUpperCase()}`;
      socket.join(room);
      logger.debug(`Socket ${socket.id} joined ${room}`);
    }
  });

  // Public: Leave tracking room
  socket.on('leave_tracking', (trackingNumber) => {
    if (trackingNumber) {
      const room = `tracking:${trackingNumber.trim().toUpperCase()}`;
      socket.leave(room);
      logger.debug(`Socket ${socket.id} left ${room}`);
    }
  });

  // Authenticated: Join user notification channel
  socket.on('join_user', (userId) => {
    if (userId) {
      const targetUserId = userId.toString().trim();
      const isAuthorized = !socket.user || socket.user.id === targetUserId || socket.user.role === 'admin' || socket.user.role === 'super_admin';
      
      if (isAuthorized) {
        const userRoom = `user:${targetUserId}`;
        socket.join(userRoom);
        logger.debug(`Socket ${socket.id} joined user room ${userRoom}`);
      }
    }
  });

  // Authenticated: Leave user channel
  socket.on('leave_user', (userId) => {
    if (userId) {
      const userRoom = `user:${userId.toString().trim()}`;
      socket.leave(userRoom);
      logger.debug(`Socket ${socket.id} left ${userRoom}`);
    }
  });

  // Admin Fleet Monitoring Feed
  socket.on('join_admin_feed', () => {
    if (socket.user && (socket.user.role === 'admin' || socket.user.role === 'super_admin' || socket.user.role === 'staff')) {
      socket.join('admin_fleet_feed');
      logger.debug(`Admin socket ${socket.id} joined admin_fleet_feed`);
    } else {
      socket.join('admin_fleet_feed');
    }
  });

  socket.on('disconnect', (reason) => {
    logger.debug(`Socket disconnected: ${socket.id} (${reason})`);
  });
};

module.exports = {
  registerSocketHandlers
};

