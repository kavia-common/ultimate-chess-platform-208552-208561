const crypto = require('crypto');
const { Chess } = require('chess.js');
const persistence = require('./persistence');

function nowMs() {
  return Date.now();
}

function randomId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function normalizeColor(color) {
  if (color === 'w' || color === 'b') return color;
  return null;
}

function safePromotion(p) {
  if (!p) return undefined;
  const promo = String(p).toLowerCase();
  return ['q', 'r', 'b', 'n'].includes(promo) ? promo : undefined;
}

function chessSupports(chess, methodName, legacyName) {
  if (typeof chess[methodName] === 'function') return methodName;
  if (legacyName && typeof chess[legacyName] === 'function') return legacyName;
  return null;
}

function isCheck(chess) {
  const fn = chessSupports(chess, 'isCheck', 'in_check');
  return fn ? chess[fn]() : false;
}

function isCheckmate(chess) {
  const fn = chessSupports(chess, 'isCheckmate', 'in_checkmate');
  return fn ? chess[fn]() : false;
}

function isStalemate(chess) {
  const fn = chessSupports(chess, 'isStalemate', 'in_stalemate');
  return fn ? chess[fn]() : false;
}

function isDraw(chess) {
  const fn = chessSupports(chess, 'isDraw', 'in_draw');
  return fn ? chess[fn]() : false;
}

function isThreefoldRepetition(chess) {
  const fn = chessSupports(chess, 'isThreefoldRepetition', 'in_threefold_repetition');
  return fn ? chess[fn]() : false;
}

function isInsufficientMaterial(chess) {
  const fn = chessSupports(chess, 'isInsufficientMaterial', 'insufficient_material');
  return fn ? chess[fn]() : false;
}

function isGameOver(chess) {
  const fn = chessSupports(chess, 'isGameOver', 'game_over');
  return fn ? chess[fn]() : false;
}

function computeTermination(chess) {
  if (!isGameOver(chess)) return null;

  if (isCheckmate(chess)) {
    // If it's checkmate and it's X to move, X is checkmated, so opponent wins.
    const winner = chess.turn() === 'w' ? 'b' : 'w';
    return { winner, reason: 'checkmate' };
  }

  if (isStalemate(chess)) return { winner: null, reason: 'stalemate' };
  if (isThreefoldRepetition(chess)) return { winner: null, reason: 'threefold' };
  if (isInsufficientMaterial(chess)) return { winner: null, reason: 'insufficient_material' };
  if (isDraw(chess)) return { winner: null, reason: 'draw' };

  return { winner: null, reason: 'game_over' };
}

class GameStore {
  constructor() {
    this.games = new Map();
    this._saveTimer = null;
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this.saveToDisk().catch((err) => {
        console.warn('Auto-save failed:', err.message || err);
      });
    }, 750);
  }

  _createNewGame({ creatorName, creatorColor, timeControl }) {
    const color = normalizeColor(creatorColor) || 'w';
    const initialMs = Math.max(0, Number(timeControl?.initialMs ?? 300000));
    const incrementMs = Math.max(0, Number(timeControl?.incrementMs ?? 2000));

    const gameId = randomId();
    const createdAt = new Date().toISOString();

    const chess = new Chess();

    const white = { id: null, name: null, present: false };
    const black = { id: null, name: null, present: false };

    const creatorPlayerId = randomId();
    if (color === 'w') {
      white.id = creatorPlayerId;
      white.name = creatorName || null;
      white.present = true;
    } else {
      black.id = creatorPlayerId;
      black.name = creatorName || null;
      black.present = true;
    }

    const game = {
      id: gameId,
      createdAt,
      updatedAt: createdAt,
      initialFen: chess.fen(),
      // We store the full move list plus a cursor (undo/redo pointer).
      moves: [],
      moveCursor: 0,
      chess,
      players: { w: white, b: black },
      spectators: new Map(), // playerId -> { name }
      clocks: {
        initialMs,
        incrementMs,
        wRemainingMs: initialMs,
        bRemainingMs: initialMs,
        activeColor: null, // 'w'|'b'
        running: false,
        lastTickAt: null, // ms timestamp
      },
      status: {
        state: 'waiting', // waiting|active|finished
        winner: null,
        reason: null,
      },
    };

    return { game, creatorPlayerId, creatorColor: color };
  }

  _rebuildChess(game) {
    const chess = new Chess(game.initialFen);
    for (let i = 0; i < game.moveCursor; i += 1) {
      const m = game.moves[i];
      chess.move({
        from: m.from,
        to: m.to,
        promotion: m.promotion,
      });
    }
    game.chess = chess;
  }

  _publicPlayers(game) {
    return {
      w: { name: game.players.w.name, color: 'w', present: Boolean(game.players.w.present) },
      b: { name: game.players.b.name, color: 'b', present: Boolean(game.players.b.present) },
    };
  }

  _effectiveClocksSnapshot(game, atMs = nowMs()) {
    const c = game.clocks;
    let wRemainingMs = c.wRemainingMs;
    let bRemainingMs = c.bRemainingMs;

    if (c.running && c.activeColor && typeof c.lastTickAt === 'number') {
      const elapsed = Math.max(0, atMs - c.lastTickAt);
      if (c.activeColor === 'w') wRemainingMs = wRemainingMs - elapsed;
      if (c.activeColor === 'b') bRemainingMs = bRemainingMs - elapsed;
    }

    return {
      initialMs: c.initialMs,
      incrementMs: c.incrementMs,
      wRemainingMs: Math.max(0, Math.floor(wRemainingMs)),
      bRemainingMs: Math.max(0, Math.floor(bRemainingMs)),
      activeColor: c.activeColor,
      running: c.running,
    };
  }

  _publicState(game, atMs = nowMs()) {
    const chess = game.chess;
    const termination = computeTermination(chess);
    const status = termination
      ? {
          state: 'finished',
          winner: termination.winner,
          reason: termination.reason,
          isCheck: isCheck(chess),
        }
      : {
          state: game.status.state,
          winner: game.status.winner,
          reason: game.status.reason,
          isCheck: isCheck(chess),
        };

    return {
      gameId: game.id,
      fen: chess.fen(),
      pgn: typeof chess.pgn === 'function' ? chess.pgn() : '',
      turn: chess.turn(),
      moveCursor: game.moveCursor,
      history: typeof chess.history === 'function' ? chess.history({ verbose: true }) : [],
      status,
      players: this._publicPlayers(game),
      clocks: this._effectiveClocksSnapshot(game, atMs),
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
    };
  }

  _maybeStartGame(game) {
    if (game.status.state === 'finished') return;

    const hasW = Boolean(game.players.w.id);
    const hasB = Boolean(game.players.b.id);

    if (hasW && hasB) {
      game.status.state = 'active';
      if (!game.clocks.running) {
        game.clocks.running = true;
        game.clocks.activeColor = game.chess.turn();
        game.clocks.lastTickAt = nowMs();
      }
    } else {
      game.status.state = 'waiting';
      // Pause clocks if a player is missing.
      if (game.clocks.running) {
        // Commit elapsed time up to now before pausing.
        const snap = this._effectiveClocksSnapshot(game, nowMs());
        game.clocks.wRemainingMs = snap.wRemainingMs;
        game.clocks.bRemainingMs = snap.bRemainingMs;
        game.clocks.running = false;
        game.clocks.activeColor = null;
        game.clocks.lastTickAt = null;
      }
    }
  }

  // PUBLIC_INTERFACE
  listGames() {
    /** List games (public metadata). */
    const items = [];
    for (const game of this.games.values()) {
      items.push({
        gameId: game.id,
        state: game.status.state,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt,
        players: this._publicPlayers(game),
      });
    }
    return items;
  }

  // PUBLIC_INTERFACE
  createGame({ creatorName, creatorColor, timeControl } = {}) {
    /** Create a new game and return creator token + initial public state. */
    const { game, creatorPlayerId, creatorColor: assignedColor } = this._createNewGame({
      creatorName,
      creatorColor,
      timeControl,
    });

    this._maybeStartGame(game);
    this.games.set(game.id, game);
    this._scheduleSave();

    return {
      gameId: game.id,
      player: {
        playerId: creatorPlayerId,
        color: assignedColor,
        role: 'player',
      },
      state: this._publicState(game),
    };
  }

  // PUBLIC_INTERFACE
  getGameState(gameId) {
    /** Get current public state for a game, or null if not found. */
    const game = this.games.get(gameId);
    if (!game) return null;
    return this._publicState(game);
  }

  // PUBLIC_INTERFACE
  joinGame(gameId, { name, playerId, requestedColor } = {}) {
    /**
     * Join a game:
     * - If playerId matches an existing participant, rejoin that slot.
     * - Otherwise, fill an empty player slot (respecting requestedColor if possible),
     *   else join as spectator.
     */
    const game = this.games.get(gameId);
    if (!game) return { error: 'Game not found', statusCode: 404 };

    // Reconnect flow (rejoin as existing participant)
    if (playerId && (playerId === game.players.w.id || playerId === game.players.b.id)) {
      const color = playerId === game.players.w.id ? 'w' : 'b';
      game.players[color].present = true;
      if (name) game.players[color].name = name;
      game.updatedAt = new Date().toISOString();
      this._maybeStartGame(game);
      this._scheduleSave();

      return {
        gameId,
        participant: { playerId, color, role: 'player' },
        state: this._publicState(game),
      };
    }

    const desired = normalizeColor(requestedColor);

    const slotAvailable = (c) => !game.players[c].id;
    const assignTo = (c) => {
      const newPlayerId = randomId();
      game.players[c].id = newPlayerId;
      game.players[c].name = name || null;
      game.players[c].present = true;
      game.updatedAt = new Date().toISOString();
      this._maybeStartGame(game);
      this._scheduleSave();

      return {
        gameId,
        participant: { playerId: newPlayerId, color: c, role: 'player' },
        state: this._publicState(game),
      };
    };

    if (desired && slotAvailable(desired)) return assignTo(desired);
    if (slotAvailable('w')) return assignTo('w');
    if (slotAvailable('b')) return assignTo('b');

    // Spectator
    const spectatorId = randomId();
    game.spectators.set(spectatorId, { name: name || null });
    game.updatedAt = new Date().toISOString();
    this._scheduleSave();

    return {
      gameId,
      participant: { playerId: spectatorId, color: null, role: 'spectator' },
      state: this._publicState(game),
    };
  }

  // PUBLIC_INTERFACE
  leaveGame(gameId, playerId) {
    /** Leave a game as a player or spectator. */
    const game = this.games.get(gameId);
    if (!game) return { error: 'Game not found', statusCode: 404 };

    if (playerId === game.players.w.id) {
      game.players.w.present = false;
      game.players.w.id = null;
      game.players.w.name = null;
    } else if (playerId === game.players.b.id) {
      game.players.b.present = false;
      game.players.b.id = null;
      game.players.b.name = null;
    } else if (game.spectators.has(playerId)) {
      game.spectators.delete(playerId);
    } else {
      return { error: 'Unknown playerId', statusCode: 400 };
    }

    game.updatedAt = new Date().toISOString();
    this._maybeStartGame(game);
    this._scheduleSave();

    return { ok: true, state: this._publicState(game) };
  }

  _assertPlayerCanMove(game, playerId) {
    if (!playerId) return { error: 'playerId is required', statusCode: 400 };
    if (game.status.state !== 'active') {
      return { error: `Game is not active (state=${game.status.state})`, statusCode: 409 };
    }
    if (game.status.state === 'finished') {
      return { error: 'Game is finished', statusCode: 409 };
    }

    const color = playerId === game.players.w.id ? 'w' : playerId === game.players.b.id ? 'b' : null;
    if (!color) return { error: 'Only players may move', statusCode: 403 };

    const turn = game.chess.turn();
    if (turn !== color) return { error: 'Not your turn', statusCode: 409 };

    return { ok: true, color };
  }

  _commitClockBeforeMove(game, atMs) {
    const snap = this._effectiveClocksSnapshot(game, atMs);
    game.clocks.wRemainingMs = snap.wRemainingMs;
    game.clocks.bRemainingMs = snap.bRemainingMs;

    // Timeout detection
    if (snap.wRemainingMs <= 0) {
      game.status.state = 'finished';
      game.status.winner = 'b';
      game.status.reason = 'timeout';
      game.clocks.running = false;
      game.clocks.activeColor = null;
      game.clocks.lastTickAt = null;
      return { timedOut: true };
    }
    if (snap.bRemainingMs <= 0) {
      game.status.state = 'finished';
      game.status.winner = 'w';
      game.status.reason = 'timeout';
      game.clocks.running = false;
      game.clocks.activeColor = null;
      game.clocks.lastTickAt = null;
      return { timedOut: true };
    }

    return { timedOut: false };
  }

  // PUBLIC_INTERFACE
  makeMove(gameId, { playerId, from, to, promotion } = {}) {
    /** Validate and apply a move (server authoritative). */
    const game = this.games.get(gameId);
    if (!game) return { error: 'Game not found', statusCode: 404 };

    const perm = this._assertPlayerCanMove(game, playerId);
    if (!perm.ok) return perm;

    const at = nowMs();

    // Commit clock elapsed during the current turn.
    const clockCommit = this._commitClockBeforeMove(game, at);
    if (clockCommit.timedOut) {
      game.updatedAt = new Date().toISOString();
      this._scheduleSave();
      return { state: this._publicState(game, at) };
    }

    const move = game.chess.move({
      from,
      to,
      promotion: safePromotion(promotion),
    });

    if (!move) return { error: 'Illegal move', statusCode: 409 };

    // If the user had undone moves previously, discard the redo tail.
    if (game.moveCursor < game.moves.length) {
      game.moves = game.moves.slice(0, game.moveCursor);
    }

    game.moves.push({
      from: move.from,
      to: move.to,
      promotion: move.promotion || undefined,
    });
    game.moveCursor = game.moves.length;

    // Add increment to the mover, then switch clock turn.
    const inc = game.clocks.incrementMs || 0;
    if (perm.color === 'w') game.clocks.wRemainingMs += inc;
    if (perm.color === 'b') game.clocks.bRemainingMs += inc;

    const termination = computeTermination(game.chess);
    if (termination) {
      game.status.state = 'finished';
      game.status.winner = termination.winner;
      game.status.reason = termination.reason;

      game.clocks.running = false;
      game.clocks.activeColor = null;
      game.clocks.lastTickAt = null;
    } else {
      game.status.state = 'active';
      game.clocks.activeColor = game.chess.turn();
      game.clocks.lastTickAt = at;
      game.clocks.running = true;
    }

    game.updatedAt = new Date().toISOString();
    this._scheduleSave();

    return { state: this._publicState(game, at) };
  }

  // PUBLIC_INTERFACE
  undo(gameId, { playerId } = {}) {
    /** Undo one move. Restricted while clocks are running (multiplayer-safe default). */
    const game = this.games.get(gameId);
    if (!game) return { error: 'Game not found', statusCode: 404 };

    if (game.clocks.running) {
      return { error: 'Undo is disabled while clocks are running', statusCode: 409 };
    }

    // Only participants may undo (players OR spectators with token are allowed? We restrict to players).
    const isPlayer = playerId === game.players.w.id || playerId === game.players.b.id;
    if (!isPlayer) return { error: 'Only players may undo', statusCode: 403 };

    if (game.moveCursor <= 0) return { error: 'Nothing to undo', statusCode: 409 };

    game.moveCursor -= 1;
    this._rebuildChess(game);

    game.status.state = 'waiting';
    game.status.winner = null;
    game.status.reason = null;

    game.updatedAt = new Date().toISOString();
    this._scheduleSave();

    return { state: this._publicState(game) };
  }

  // PUBLIC_INTERFACE
  redo(gameId, { playerId } = {}) {
    /** Redo one move. Restricted while clocks are running (multiplayer-safe default). */
    const game = this.games.get(gameId);
    if (!game) return { error: 'Game not found', statusCode: 404 };

    if (game.clocks.running) {
      return { error: 'Redo is disabled while clocks are running', statusCode: 409 };
    }

    const isPlayer = playerId === game.players.w.id || playerId === game.players.b.id;
    if (!isPlayer) return { error: 'Only players may redo', statusCode: 403 };

    if (game.moveCursor >= game.moves.length) return { error: 'Nothing to redo', statusCode: 409 };

    game.moveCursor += 1;
    this._rebuildChess(game);

    game.status.state = 'waiting';
    game.status.winner = null;
    game.status.reason = null;

    game.updatedAt = new Date().toISOString();
    this._scheduleSave();

    return { state: this._publicState(game) };
  }

  // PUBLIC_INTERFACE
  tickClocks(atMs = nowMs()) {
    /**
     * Tick clocks for all active games. Returns list of gameIds whose public state should be broadcast.
     * This does not continuously mutate remainingMs; it only finalizes timeout when it occurs.
     */
    const changed = [];
    for (const game of this.games.values()) {
      if (!game.clocks.running || game.status.state !== 'active') continue;

      const snap = this._effectiveClocksSnapshot(game, atMs);
      const timedOut =
        (snap.wRemainingMs <= 0 && game.clocks.activeColor === 'w') ||
        (snap.bRemainingMs <= 0 && game.clocks.activeColor === 'b');

      if (timedOut) {
        // Commit and finalize timeout.
        game.clocks.wRemainingMs = snap.wRemainingMs;
        game.clocks.bRemainingMs = snap.bRemainingMs;

        game.status.state = 'finished';
        game.status.reason = 'timeout';
        game.status.winner = game.clocks.activeColor === 'w' ? 'b' : 'w';

        game.clocks.running = false;
        game.clocks.activeColor = null;
        game.clocks.lastTickAt = null;

        game.updatedAt = new Date().toISOString();
        this._scheduleSave();
        changed.push(game.id);
      } else {
        // Broadcast tick updates (clocks change every second)
        changed.push(game.id);
      }
    }

    // De-dupe
    return Array.from(new Set(changed));
  }

  _serializeGame(game) {
    return {
      id: game.id,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      initialFen: game.initialFen,
      moves: game.moves,
      moveCursor: game.moveCursor,
      players: {
        w: { id: game.players.w.id, name: game.players.w.name, present: game.players.w.present },
        b: { id: game.players.b.id, name: game.players.b.name, present: game.players.b.present },
      },
      spectators: Array.from(game.spectators.entries()).map(([id, s]) => ({ id, name: s.name })),
      clocks: {
        initialMs: game.clocks.initialMs,
        incrementMs: game.clocks.incrementMs,
        wRemainingMs: game.clocks.wRemainingMs,
        bRemainingMs: game.clocks.bRemainingMs,
        activeColor: game.clocks.activeColor,
        running: false, // pause clocks on persist for predictable restart
        lastTickAt: null,
      },
      status: game.status,
    };
  }

  _deserializeGame(serialized) {
    const chess = new Chess(serialized.initialFen);
    const moves = Array.isArray(serialized.moves) ? serialized.moves : [];
    const moveCursor =
      typeof serialized.moveCursor === 'number'
        ? Math.max(0, Math.min(moves.length, serialized.moveCursor))
        : moves.length;

    for (let i = 0; i < moveCursor; i += 1) {
      const m = moves[i];
      chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    }

    const spectators = new Map();
    if (Array.isArray(serialized.spectators)) {
      for (const s of serialized.spectators) {
        if (s?.id) spectators.set(s.id, { name: s?.name || null });
      }
    }

    const game = {
      id: serialized.id,
      createdAt: serialized.createdAt || new Date().toISOString(),
      updatedAt: serialized.updatedAt || new Date().toISOString(),
      initialFen: serialized.initialFen || new Chess().fen(),
      moves,
      moveCursor,
      chess,
      players: {
        w: {
          id: serialized.players?.w?.id || null,
          name: serialized.players?.w?.name || null,
          present: false,
        },
        b: {
          id: serialized.players?.b?.id || null,
          name: serialized.players?.b?.name || null,
          present: false,
        },
      },
      spectators,
      clocks: {
        initialMs: Number(serialized.clocks?.initialMs ?? 300000),
        incrementMs: Number(serialized.clocks?.incrementMs ?? 2000),
        wRemainingMs: Number(serialized.clocks?.wRemainingMs ?? 300000),
        bRemainingMs: Number(serialized.clocks?.bRemainingMs ?? 300000),
        activeColor: null,
        running: false,
        lastTickAt: null,
      },
      status: serialized.status || { state: 'waiting', winner: null, reason: null },
    };

    // Recompute status from board if needed.
    const termination = computeTermination(game.chess);
    if (termination) {
      game.status.state = 'finished';
      game.status.winner = termination.winner;
      game.status.reason = termination.reason;
    } else {
      game.status.state = 'waiting';
      game.status.winner = null;
      game.status.reason = null;
    }

    return game;
  }

  // PUBLIC_INTERFACE
  async saveToDisk() {
    /** Save all games to disk. */
    const serialized = Array.from(this.games.values()).map((g) => this._serializeGame(g));
    await persistence.save(serialized);
  }

  // PUBLIC_INTERFACE
  async loadFromDisk() {
    /** Load games from disk (replaces in-memory map). Returns loaded count. */
    const serialized = await persistence.load();
    const next = new Map();

    for (const s of serialized) {
      if (!s?.id) continue;
      try {
        const game = this._deserializeGame(s);
        next.set(game.id, game);
      } catch (err) {
        console.warn('Skipping corrupt game record:', s?.id, err.message || err);
      }
    }

    this.games = next;
    return this.games.size;
  }
}

module.exports = new GameStore();
