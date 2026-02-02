const express = require('express');
const healthController = require('../controllers/health');
const gamesRouter = require('./games');

const router = express.Router();

/**
 * @swagger
 * /:
 *   get:
 *     tags: [Health]
 *     summary: Health endpoint
 *     responses:
 *       200:
 *         description: Service health check passed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: Service is healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 *                   example: development
 */
router.get('/', healthController.check.bind(healthController));

/**
 * @swagger
 * /ws:
 *   get:
 *     tags: [WebSocket]
 *     summary: Socket.IO usage notes (event names and connection URL)
 *     description: |
 *       This backend uses Socket.IO. Connect to the server using the Socket.IO client with the `wsUrl` provided.
 *
 *       Recommended flow:
 *       - Connect socket
 *       - Emit `game:join` with `{ gameId, name, playerId? }` (or `match:find`)
 *       - Listen for `game:state` updates
 *       - Emit `game:move` with `{ gameId, playerId, from, to, promotion? }`
 *     responses:
 *       200:
 *         description: WebSocket connection info and supported events
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 wsUrl:
 *                   type: string
 *                   example: https://example.com
 *                 namespace:
 *                   type: string
 *                   example: /
 *                 events:
 *                   type: object
 */
router.get('/ws', (req, res) => {
  const wsUrl =
    process.env.REACT_APP_WS_URL ||
    `${req.secure ? 'https' : 'http'}://${req.get('host')}`;

  res.json({
    wsUrl,
    namespace: '/',
    events: {
      clientToServer: [
        'match:find',
        'match:cancel',
        'game:create',
        'game:join',
        'game:leave',
        'game:sync',
        'game:move',
        'game:undo',
        'game:redo',
      ],
      serverToClient: ['server:hello', 'match:found', 'game:state', 'game:error'],
    },
  });
});

// Game REST API
router.use('/api/games', gamesRouter);

module.exports = router;
