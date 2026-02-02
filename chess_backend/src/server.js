const http = require('http');
const app = require('./app');
const gameStore = require('./services/gameStore');
const { createSocketServer } = require('./socket');

const PORT = Number(process.env.REACT_APP_PORT || process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

async function bootstrap() {
  // Best-effort load persisted games (does not block server from starting).
  try {
    await gameStore.loadFromDisk();
  } catch (err) {
    console.warn('Failed to load persisted games:', err.message || err);
  }

  const server = http.createServer(app);
  const io = createSocketServer(server);

  server.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`${signal} signal received: closing HTTP + Socket.IO server`);
    try {
      io.close();
    } catch (err) {
      console.warn('Socket.IO close error:', err.message || err);
    }

    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

module.exports = bootstrap();
