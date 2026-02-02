const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Ultimate Chess Platform API',
      version: '0.2.0',
      description:
        'REST API + Socket.IO realtime API for multiplayer chess. The server is authoritative for move legality and game termination states.',
    },
    tags: [
      { name: 'Health', description: 'Service health and diagnostics' },
      { name: 'Games', description: 'Game/session lifecycle, state, and moves' },
      {
        name: 'WebSocket',
        description:
          'Socket.IO connection and event contract (see GET /ws for usage notes)',
      },
    ],
    components: {
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'error' },
            message: { type: 'string', example: 'Invalid request' },
            details: { type: 'object', additionalProperties: true },
          },
        },
        TimeControl: {
          type: 'object',
          properties: {
            initialMs: { type: 'integer', example: 300000 },
            incrementMs: { type: 'integer', example: 2000 },
          },
        },
        CreateGameRequest: {
          type: 'object',
          properties: {
            creatorName: { type: 'string', example: 'Alice' },
            creatorColor: { type: 'string', enum: ['w', 'b'], example: 'w' },
            timeControl: { $ref: '#/components/schemas/TimeControl' },
            initialFen: {
              type: 'string',
              description:
                'Optional. Initialize a new game from a given FEN (used for save/load snapshots). If invalid, server falls back to standard start position.',
              example: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            },
          },
        },
        CreateGameResponse: {
          type: 'object',
          properties: {
            gameId: { type: 'string', example: 'c7f7f7be-4f75-4c9a-9d64-...' },
            player: {
              type: 'object',
              properties: {
                playerId: { type: 'string' },
                color: { type: 'string', enum: ['w', 'b'] },
                role: { type: 'string', enum: ['player'] },
              },
            },
            state: { $ref: '#/components/schemas/GameState' },
          },
        },
        JoinGameRequest: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'Bob' },
            playerId: {
              type: 'string',
              description:
                'Optional. If provided and valid, will rejoin as that same player (reconnect flow).',
            },
            requestedColor: { type: 'string', enum: ['w', 'b'] },
          },
        },
        JoinGameResponse: {
          type: 'object',
          properties: {
            gameId: { type: 'string' },
            participant: {
              type: 'object',
              properties: {
                playerId: { type: 'string' },
                color: { type: 'string', enum: ['w', 'b'] },
                role: { type: 'string', enum: ['player', 'spectator'] },
              },
            },
            state: { $ref: '#/components/schemas/GameState' },
          },
        },
        MoveRequest: {
          type: 'object',
          required: ['playerId', 'from', 'to'],
          properties: {
            playerId: { type: 'string' },
            from: { type: 'string', example: 'e2' },
            to: { type: 'string', example: 'e4' },
            promotion: { type: 'string', enum: ['q', 'r', 'b', 'n'] },
          },
        },
        MoveResponse: {
          type: 'object',
          properties: {
            state: { $ref: '#/components/schemas/GameState' },
          },
        },
        LeaveGameRequest: {
          type: 'object',
          required: ['playerId'],
          properties: {
            playerId: { type: 'string' },
          },
        },
        PlayerPublic: {
          type: 'object',
          properties: {
            name: { type: 'string', nullable: true, example: 'Alice' },
            color: { type: 'string', enum: ['w', 'b'] },
            present: { type: 'boolean', example: true },
          },
        },
        ClocksState: {
          type: 'object',
          properties: {
            initialMs: { type: 'integer', example: 300000 },
            incrementMs: { type: 'integer', example: 2000 },
            wRemainingMs: { type: 'integer', example: 298523 },
            bRemainingMs: { type: 'integer', example: 300000 },
            activeColor: { type: 'string', enum: ['w', 'b'], nullable: true },
            running: { type: 'boolean', example: true },
          },
        },
        GameStatus: {
          type: 'object',
          properties: {
            state: {
              type: 'string',
              enum: ['waiting', 'active', 'finished'],
              example: 'active',
            },
            winner: { type: 'string', enum: ['w', 'b'], nullable: true },
            reason: {
              type: 'string',
              example: 'checkmate | stalemate | draw | resignation | timeout',
            },
            isCheck: { type: 'boolean', example: false },
          },
        },
        MoveVerbose: {
          type: 'object',
          properties: {
            san: { type: 'string', example: 'e4' },
            from: { type: 'string', example: 'e2' },
            to: { type: 'string', example: 'e4' },
            promotion: { type: 'string', nullable: true, example: null },
            piece: { type: 'string', example: 'p' },
            captured: { type: 'string', nullable: true },
            flags: { type: 'string', example: 'b' },
          },
        },
        GameState: {
          type: 'object',
          properties: {
            gameId: { type: 'string' },
            fen: { type: 'string' },
            pgn: { type: 'string' },
            turn: { type: 'string', enum: ['w', 'b'] },
            moveCursor: {
              type: 'integer',
              description:
                'Undo/redo pointer: number of moves currently applied from the stored move list.',
              example: 7,
            },
            history: {
              type: 'array',
              items: { $ref: '#/components/schemas/MoveVerbose' },
            },
            status: { $ref: '#/components/schemas/GameStatus' },
            players: {
              type: 'object',
              properties: {
                w: { $ref: '#/components/schemas/PlayerPublic' },
                b: { $ref: '#/components/schemas/PlayerPublic' },
              },
            },
            clocks: { $ref: '#/components/schemas/ClocksState' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        GameListItem: {
          type: 'object',
          properties: {
            gameId: { type: 'string' },
            state: { type: 'string', example: 'active' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            players: {
              type: 'object',
              properties: {
                w: { $ref: '#/components/schemas/PlayerPublic' },
                b: { $ref: '#/components/schemas/PlayerPublic' },
              },
            },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js', './src/routes/**/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);
module.exports = swaggerSpec;
