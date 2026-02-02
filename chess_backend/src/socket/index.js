const { Server } = require('socket.io');
const gameStore = require('../services/gameStore');

function buildAllowedOrigins() {
  const envList = [
    process.env.REACT_APP_FRONTEND_URL,
    process.env.REACT_APP_BACKEND_URL,
    process.env.REACT_APP_WS_URL,
  ].filter(Boolean);

  // If no URLs are provided, allow all (dev-friendly).
  return envList.length ? envList : '*';
}

// PUBLIC_INTERFACE
function createSocketServer(httpServer) {
  /** Create and attach a Socket.IO server to the given Node HTTP server. */
  const allowedOrigins = buildAllowedOrigins();

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
    },
  });

  // Simple matchmaking queue (socket.id -> preferences)
  const matchmakingQueue = [];

  function enqueue(socket, payload) {
    if (matchmakingQueue.find((q) => q.socketId === socket.id)) return;
    matchmakingQueue.push({ socketId: socket.id, payload: payload || {} });
  }

  function dequeue(socketId) {
    const idx = matchmakingQueue.findIndex((q) => q.socketId === socketId);
    if (idx >= 0) matchmakingQueue.splice(idx, 1);
  }

  function emitStateToRoom(gameId) {
    const state = gameStore.getGameState(gameId);
    if (!state) return;
    io.to(gameId).emit('game:state', state);
  }

  function safeAck(ack, payload) {
    if (typeof ack === 'function') ack(payload);
  }

  io.on('connection', (socket) => {
    socket.emit('server:hello', {
      name: 'ultimate-chess-platform',
      version: '0.2.0',
      now: new Date().toISOString(),
    });

    socket.on('match:find', (payload, ack) => {
      enqueue(socket, payload);

      // If we have 2+ players waiting, pair the first two.
      if (matchmakingQueue.length >= 2) {
        const a = matchmakingQueue.shift();
        const b = matchmakingQueue.shift();

        const aSocket = io.sockets.sockets.get(a.socketId);
        const bSocket = io.sockets.sockets.get(b.socketId);

        if (!aSocket || !bSocket) {
          // Requeue if one side disappeared.
          if (aSocket) matchmakingQueue.unshift(a);
          if (bSocket) matchmakingQueue.unshift(b);
          return;
        }

        // Create game and assign players.
        const createRes = gameStore.createGame({
          creatorName: a.payload?.name,
          creatorColor: Math.random() < 0.5 ? 'w' : 'b',
          timeControl: a.payload?.timeControl,
        });

        const gameId = createRes.gameId;

        const joinRes = gameStore.joinGame(gameId, {
          name: b.payload?.name,
        });

        // Join sockets to room
        aSocket.join(gameId);
        bSocket.join(gameId);

        // Provide each player their token (only to themselves).
        aSocket.emit('match:found', {
          gameId,
          participant: createRes.player,
          state: createRes.state,
        });
        bSocket.emit('match:found', {
          gameId,
          participant: joinRes.participant,
          state: joinRes.state,
        });

        emitStateToRoom(gameId);
      }

      safeAck(ack, { ok: true });
    });

    socket.on('match:cancel', (payload, ack) => {
      dequeue(socket.id);
      safeAck(ack, { ok: true });
    });

    socket.on('game:create', (payload, ack) => {
      try {
        const res = gameStore.createGame(payload || {});
        socket.join(res.gameId);
        safeAck(ack, { ok: true, ...res });
        emitStateToRoom(res.gameId);
      } catch (err) {
        socket.emit('game:error', { message: err.message || 'Failed to create game' });
        safeAck(ack, { ok: false, message: err.message || 'Failed to create game' });
      }
    });

    socket.on('game:join', (payload, ack) => {
      const { gameId } = payload || {};
      if (!gameId) return safeAck(ack, { ok: false, message: 'gameId is required' });

      const res = gameStore.joinGame(gameId, payload || {});
      if (res?.error) {
        socket.emit('game:error', { message: res.error });
        return safeAck(ack, { ok: false, message: res.error });
      }

      socket.join(gameId);
      safeAck(ack, { ok: true, ...res });
      emitStateToRoom(gameId);
    });

    socket.on('game:leave', (payload, ack) => {
      const { gameId, playerId } = payload || {};
      if (!gameId || !playerId) return safeAck(ack, { ok: false, message: 'gameId and playerId required' });

      const res = gameStore.leaveGame(gameId, playerId);
      if (res?.error) {
        socket.emit('game:error', { message: res.error });
        return safeAck(ack, { ok: false, message: res.error });
      }

      socket.leave(gameId);
      safeAck(ack, { ok: true });
      emitStateToRoom(gameId);
    });

    socket.on('game:sync', (payload, ack) => {
      const { gameId } = payload || {};
      if (!gameId) return safeAck(ack, { ok: false, message: 'gameId is required' });

      const state = gameStore.getGameState(gameId);
      if (!state) return safeAck(ack, { ok: false, message: 'Game not found' });

      safeAck(ack, { ok: true, state });
      socket.emit('game:state', state);
    });

    socket.on('game:move', (payload, ack) => {
      const { gameId } = payload || {};
      if (!gameId) return safeAck(ack, { ok: false, message: 'gameId is required' });

      const res = gameStore.makeMove(gameId, payload || {});
      if (res?.error) {
        socket.emit('game:error', { message: res.error });
        return safeAck(ack, { ok: false, message: res.error });
      }

      safeAck(ack, { ok: true, state: res.state });
      emitStateToRoom(gameId);
    });

    socket.on('game:undo', (payload, ack) => {
      const { gameId } = payload || {};
      if (!gameId) return safeAck(ack, { ok: false, message: 'gameId is required' });

      const res = gameStore.undo(gameId, payload || {});
      if (res?.error) {
        socket.emit('game:error', { message: res.error });
        return safeAck(ack, { ok: false, message: res.error });
      }

      safeAck(ack, { ok: true, state: res.state });
      emitStateToRoom(gameId);
    });

    socket.on('game:redo', (payload, ack) => {
      const { gameId } = payload || {};
      if (!gameId) return safeAck(ack, { ok: false, message: 'gameId is required' });

      const res = gameStore.redo(gameId, payload || {});
      if (res?.error) {
        socket.emit('game:error', { message: res.error });
        return safeAck(ack, { ok: false, message: res.error });
      }

      safeAck(ack, { ok: true, state: res.state });
      emitStateToRoom(gameId);
    });

    socket.on('disconnect', () => {
      dequeue(socket.id);
    });
  });

  // Clock tick broadcaster (1 Hz)
  const tickInterval = setInterval(() => {
    const changedGameIds = gameStore.tickClocks(Date.now());
    for (const gameId of changedGameIds) {
      emitStateToRoom(gameId);
    }
  }, 1000);

  // Ensure interval doesn't keep the process alive unnecessarily.
  tickInterval.unref?.();

  return io;
}

module.exports = { createSocketServer };
