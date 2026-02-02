const gameStore = require('../services/gameStore');

class GamesController {
  // PUBLIC_INTERFACE
  async list(req, res) {
    /** List known games (light metadata). */
    const games = gameStore.listGames();
    return res.status(200).json({ games });
  }

  // PUBLIC_INTERFACE
  async create(req, res) {
    /** Create a new game and return the creator's player token. */
    const { creatorName, creatorColor, timeControl } = req.body || {};

    const result = gameStore.createGame({
      creatorName,
      creatorColor,
      timeControl,
    });

    return res.status(201).json(result);
  }

  // PUBLIC_INTERFACE
  async load(req, res) {
    /** Load persisted games from disk into memory. */
    const loaded = await gameStore.loadFromDisk();
    return res.status(200).json({ loaded });
  }

  // PUBLIC_INTERFACE
  async getState(req, res) {
    /** Fetch the current public state for a game. */
    const { gameId } = req.params;
    const state = gameStore.getGameState(gameId);
    if (!state) {
      return res.status(404).json({ status: 'error', message: 'Game not found' });
    }
    return res.status(200).json(state);
  }

  // PUBLIC_INTERFACE
  async join(req, res) {
    /** Join a game as a player (if slot available) or spectator. */
    const { gameId } = req.params;
    const { name, playerId, requestedColor } = req.body || {};

    const joined = gameStore.joinGame(gameId, { name, playerId, requestedColor });
    if (joined?.error) {
      const status = joined.statusCode || 400;
      return res.status(status).json({ status: 'error', message: joined.error });
    }

    return res.status(200).json(joined);
  }

  // PUBLIC_INTERFACE
  async leave(req, res) {
    /** Leave a game (player or spectator). */
    const { gameId } = req.params;
    const { playerId } = req.body || {};
    if (!playerId) {
      return res
        .status(400)
        .json({ status: 'error', message: 'playerId is required' });
    }

    const result = gameStore.leaveGame(gameId, playerId);
    if (result?.error) {
      const status = result.statusCode || 400;
      return res.status(status).json({ status: 'error', message: result.error });
    }

    return res.status(200).json(result);
  }

  // PUBLIC_INTERFACE
  async move(req, res) {
    /** Make a chess move; server validates legality and clocks. */
    const { gameId } = req.params;
    const { playerId, from, to, promotion } = req.body || {};

    const result = gameStore.makeMove(gameId, { playerId, from, to, promotion });
    if (result?.error) {
      const status = result.statusCode || 409;
      return res.status(status).json({ status: 'error', message: result.error });
    }

    return res.status(200).json({ state: result.state });
  }

  // PUBLIC_INTERFACE
  async undo(req, res) {
    /** Undo one move (restricted while timed game is running). */
    const { gameId } = req.params;
    const { playerId } = req.body || {};
    const result = gameStore.undo(gameId, { playerId });

    if (result?.error) {
      const status = result.statusCode || 409;
      return res.status(status).json({ status: 'error', message: result.error });
    }

    return res.status(200).json(result.state);
  }

  // PUBLIC_INTERFACE
  async redo(req, res) {
    /** Redo one move (restricted while timed game is running). */
    const { gameId } = req.params;
    const { playerId } = req.body || {};
    const result = gameStore.redo(gameId, { playerId });

    if (result?.error) {
      const status = result.statusCode || 409;
      return res.status(status).json({ status: 'error', message: result.error });
    }

    return res.status(200).json(result.state);
  }

  // PUBLIC_INTERFACE
  async save(req, res) {
    /** Force-save all in-memory games to disk (best-effort). */
    await gameStore.saveToDisk();
    return res.status(200).json({ ok: true });
  }
}

module.exports = new GamesController();
