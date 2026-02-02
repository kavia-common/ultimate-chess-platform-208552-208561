const cors = require('cors');
const express = require('express');
const routes = require('./routes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../swagger');

// Initialize express app
const app = express();

/**
 * Allow all origins by default, but if REACT_APP_FRONTEND_URL is provided, restrict to that.
 * Note: Socket.IO has its own CORS config in src/socket/index.js.
 */
const allowedOrigins = process.env.REACT_APP_FRONTEND_URL
  ? [process.env.REACT_APP_FRONTEND_URL]
  : '*';

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser callers (no Origin header) and same-origin calls.
      if (!origin) return callback(null, true);

      if (allowedOrigins === '*') return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.set('trust proxy', process.env.REACT_APP_TRUST_PROXY || true);

// Parse JSON request body
app.use(express.json());

function buildDynamicSpec(req) {
  const host = req.get('host'); // may or may not include port
  let protocol = req.protocol; // http or https

  const actualPort = req.socket.localPort;
  const hasPort = host.includes(':');

  const needsPort =
    !hasPort &&
    ((protocol === 'http' && actualPort !== 80) ||
      (protocol === 'https' && actualPort !== 443));

  const fullHost = needsPort ? `${host}:${actualPort}` : host;
  protocol = req.secure ? 'https' : protocol;

  return {
    ...swaggerSpec,
    servers: [
      {
        url: `${protocol}://${fullHost}`,
      },
    ],
  };
}

// Expose OpenAPI spec as JSON (useful for frontend + container interface discovery)
app.get('/openapi.json', (req, res) => {
  res.json(buildDynamicSpec(req));
});

app.use('/docs', swaggerUi.serve, (req, res, next) => {
  swaggerUi.setup(buildDynamicSpec(req))(req, res, next);
});

// Mount routes
app.use('/', routes);

// Error handling middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.stack || err);
  res.status(500).json({
    status: 'error',
    message: 'Internal Server Error',
  });
});

module.exports = app;
