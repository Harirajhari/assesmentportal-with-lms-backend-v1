const { Server } = require('socket.io');
const { verifyAccessToken } = require('./services/auth.service');
const { syncContestStatuses, emitLeaderboard } = require('./services/contest.service');
const logger = require('./config/logger');

/**
 * Attach Socket.io to the HTTP server.
 * Call this in server.js after app.listen().
 */
const initSocket = (httpServer, app) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
  });

  // Make io available to controllers via req.app.get('io')
  app.set('io', io);

  // ── Auth middleware ──────────────────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Auth token required'));

    const decoded = verifyAccessToken(token);
    if (!decoded) return next(new Error('Invalid token'));

    socket.userId = decoded.id;
    next();
  });

  // ── Connection handler ───────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    logger.debug(`Socket connected: ${socket.id} (user: ${socket.userId})`);

    // Client joins a contest room to receive live leaderboard pushes
    socket.on('contest:join', async ({ contestId }) => {
      if (!contestId) return;
      socket.join(`contest:${contestId}`);
      logger.debug(`Socket ${socket.id} joined contest room: ${contestId}`);

      // Send current leaderboard immediately on join
      await emitLeaderboard(io, contestId);
    });

    socket.on('contest:leave', ({ contestId }) => {
      socket.leave(`contest:${contestId}`);
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });

  // ── Periodic contest status sync (every 30 seconds) ──────────────────────────
  setInterval(async () => {
    try {
      await syncContestStatuses();
    } catch (err) {
      logger.error('Contest status sync error:', err.message);
    }
  }, 30_000);

  logger.info('🔌 Socket.io initialized');
  return io;
};

module.exports = { initSocket };