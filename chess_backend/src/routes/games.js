const express = require('express');
const gamesController = require('../controllers/games');

const router = express.Router();

/**
 * @swagger
 * /api/games:
 *   get:
 *     tags: [Games]
 *     summary: List games (light metadata)
 *     responses:
 *       200:
 *         description: List of games
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 games:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/GameListItem'
 */
router.get('/', gamesController.list.bind(gamesController));

/**
 * @swagger
 * /api/games:
 *   post:
 *     tags: [Games]
 *     summary: Create a new chess game
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateGameRequest'
 *     responses:
 *       201:
 *         description: Game created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateGameResponse'
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', gamesController.create.bind(gamesController));

/**
 * @swagger
 * /api/games/load:
 *   post:
 *     tags: [Games]
 *     summary: Load persisted games from disk into memory (best-effort)
 *     responses:
 *       200:
 *         description: Loaded games count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 loaded:
 *                   type: integer
 *                   example: 5
 */
router.post('/load', gamesController.load.bind(gamesController));

/**
 * @swagger
 * /api/games/{gameId}:
 *   get:
 *     tags: [Games]
 *     summary: Get game state (public/sanitized)
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Game state
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GameState'
 *       404:
 *         description: Not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:gameId', gamesController.getState.bind(gamesController));

/**
 * @swagger
 * /api/games/{gameId}/join:
 *   post:
 *     tags: [Games]
 *     summary: Join a game as a player (if slot free) or spectator
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/JoinGameRequest'
 *     responses:
 *       200:
 *         description: Joined
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JoinGameResponse'
 *       404:
 *         description: Not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:gameId/join', gamesController.join.bind(gamesController));

/**
 * @swagger
 * /api/games/{gameId}/leave:
 *   post:
 *     tags: [Games]
 *     summary: Leave a game (player or spectator)
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LeaveGameRequest'
 *     responses:
 *       200:
 *         description: Left
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 state:
 *                   $ref: '#/components/schemas/GameState'
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:gameId/leave', gamesController.leave.bind(gamesController));

/**
 * @swagger
 * /api/games/{gameId}/move:
 *   post:
 *     tags: [Games]
 *     summary: Make a move (authoritative server validation)
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MoveRequest'
 *     responses:
 *       200:
 *         description: Move applied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MoveResponse'
 *       409:
 *         description: Illegal move or wrong turn
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:gameId/move', gamesController.move.bind(gamesController));

/**
 * @swagger
 * /api/games/{gameId}/undo:
 *   post:
 *     tags: [Games]
 *     summary: Undo one move (restricted: disabled while clocks are running)
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LeaveGameRequest'
 *     responses:
 *       200:
 *         description: Undone
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GameState'
 *       409:
 *         description: Not allowed (e.g. game is actively timed)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:gameId/undo', gamesController.undo.bind(gamesController));

/**
 * @swagger
 * /api/games/{gameId}/redo:
 *   post:
 *     tags: [Games]
 *     summary: Redo one move (restricted: disabled while clocks are running)
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LeaveGameRequest'
 *     responses:
 *       200:
 *         description: Redone
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GameState'
 *       409:
 *         description: Not allowed (e.g. game is actively timed)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:gameId/redo', gamesController.redo.bind(gamesController));

/**
 * @swagger
 * /api/games/{gameId}/save:
 *   post:
 *     tags: [Games]
 *     summary: Force-save all in-memory games to disk
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 */
router.post('/:gameId/save', gamesController.save.bind(gamesController));

module.exports = router;
