const express = require('express');

const cors = require('cors');

const dotenv = require('dotenv');

dotenv.config();

const http = require('http');

const path = require('path');

const crypto = require('crypto');

const fileUpload = require('express-fileupload');

const fs = require('fs');

const connectDB = require('./config/database');

const { getAllowedOrigins, isOriginAllowed } = require('./config/env');

const errorHandler = require('./middleware/errorHandler');

const securityHeaders = require('./middleware/securityHeaders');

const { createRateLimiter } = require('./middleware/rateLimit');

const { registerCronJobs } = require('./services/cronJobs');

const { initSocket, closeSocketAdapter } = require('./socket');

const logger = require('./utils/logger');

const { logSystemErrorEvent } = require('./services/systemErrorService');

const { recordBehaviorEvent } = require('./services/behaviorEventService');

const auth = require('./middleware/auth');

const adminAuth = require('./middleware/adminAuth');

const ipBlockGuard = require('./middleware/ipBlockGuard');

const { ensureBootstrapAdminFromEnv } = require('./services/adminBootstrapService');

const authRoutes = require('./routes/auth');

const matchRoutes = require('./routes/match');

const appealRoutes = require('./routes/appeals');

const referralRoutes = require('./routes/referrals');

const newsRoutes = require('./routes/news');

const wishRoutes = require('./routes/wishes');

const adminRoutes = require('./routes/admin');

const treeRoutes = require('./routes/tree');

const solarRoutes = require('./routes/solar');

const fortuneRoutes = require('./routes/fortune');

const entityRoutes = require('./routes/entity');

const bridgeRoutes = require('./routes/bridges');

const battleRoutes = require('./routes/battles');
const adsRoutes = require('./routes/ads');
const adBoostRoutes = require('./routes/adBoosts');
const chatRoutes = require('./routes/chats');
const activityRoutes = require('./routes/activity');

const chronicleRoutes = require('./routes/chronicle');

const evilRootRoutes = require('./routes/evilRoot');

const meditationRoutes = require('./routes/meditation');

const shopRoutes = require('./routes/shop');

const warehouseRoutes = require('./routes/warehouse');

const feedbackRoutes = require('./routes/feedback');

const pagesRoutes = require('./routes/pages');

const achievementsRoutes = require('./routes/achievements');

const nightShiftRoutes = require('./routes/nightShiftRoutes');

const metaRoutes = require('./routes/meta');

const dailyStreakRoutes = require('./routes/dailyStreak');

const radianceRoutes = require('./routes/radiance');

const economyRoutes = require('./routes/economy');

const practiceRoutes = require('./routes/practice');

const quoteController = require('./controllers/quoteController');



const app = express();

const server = http.createServer(app);

let serverStarted = false;

let ioInstance = null;

let shuttingDown = false;

const allowedOrigins = getAllowedOrigins();

const loginRateLimit = createRateLimiter({ max: 8, windowMs: 15 * 60 * 1000, message: 'Слишком много попыток входа. Подождите 15 минут.' });

const passwordRecoveryRateLimit = createRateLimiter({ max: 5, windowMs: 15 * 60 * 1000, message: 'Слишком много запросов на восстановление. Подождите 15 минут.' });

const uploadRateLimit = createRateLimiter({ max: 30, windowMs: 15 * 60 * 1000, message: 'Слишком много загрузок. Подождите немного.' });

const ALLOWED_UPLOAD_MIME_TYPES = new Set([

  'image/jpeg',

  'image/png',

  'image/webp',

  'image/gif',

  'video/mp4',

  'video/webm',

  'video/quicktime',

]);

const ALLOWED_UPLOAD_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm', '.mov']);



app.set('trust proxy', 1);



function isSuspiciousRequestPath(pathname) {

  const safePath = String(pathname || '').split('?')[0].trim().toLowerCase();

  if (!safePath) return false;

  return [

    '/fortune',

    '/bridges',

    '/tree/solar',

    '/battles',

    '/activity',

    '/daily-streak',

    '/night-shift',

  ].some((prefix) => safePath === prefix || safePath.startsWith(`${prefix}/`));

}



logger.info('[CORS] Allowed origins', {

  origins: allowedOrigins.length ? allowedOrigins : ['(none)'],

});



// Middleware

app.use(securityHeaders);

app.use(cors({

  origin(origin, callback) {

    if (isOriginAllowed(origin, allowedOrigins)) {

      return callback(null, true);

    }

    logger.warn('[CORS] Blocked HTTP origin', { origin: origin || '(empty)' });

    return callback(new Error(`Not allowed by CORS: ${origin || '(empty)'}`));

  },

  credentials: true

}));

app.use(express.json());

app.use(fileUpload({

  limits: {

    fileSize: 20 * 1024 * 1024,

  },

  abortOnLimit: true,

  createParentPath: false,

  safeFileNames: false,

  preserveExtension: false,

}));

app.use(ipBlockGuard);



// Request log for every API hit (method/path/status/duration)

app.use((req, res, next) => {

  const startedAt = Date.now();

  res.on('finish', () => {

    const pathName = req.originalUrl || req.url;

    const durationMs = Date.now() - startedAt;

    const statusCode = Number(res.statusCode) || 0;



    // At scale, logging every request is expensive and mostly noise.

    // Log only slow requests and non-2xx responses by default.

    const shouldLogHttpRequest = statusCode >= 400 || durationMs >= 2000;

    if (shouldLogHttpRequest) {

      const level = statusCode >= 500 ? 'error' : 'warn';

      logger[level]('HTTP request', {

        method: req.method,

        path: pathName,

        statusCode,

        durationMs,

        ip: req.ip,

        userAgent: req.headers['user-agent'],

      });

    }



    if (!req.user?._id) return;

    if (!isSuspiciousRequestPath(pathName)) return;



    if ([400, 403, 409, 429].includes(statusCode)) {

      recordBehaviorEvent({

        userId: req.user._id,

        category: 'http',

        eventType: 'request_error',

        sessionId: req.auth?.sid || '',

        path: pathName,

        scoreHint: statusCode === 429 ? 4 : 2,

        meta: {

          method: req.method,

          statusCode,

          durationMs,

        },

      }).catch(() => { });

      return;

    }



    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(String(req.method || '').toUpperCase())) return;

    if (statusCode < 200 || statusCode >= 300) return;



    recordBehaviorEvent({

      userId: req.user._id,

      category: 'http',

      eventType: 'request_action',

      sessionId: req.auth?.sid || '',

      path: pathName,

      scoreHint: 0,

      meta: {

        method: req.method,

        statusCode,

        durationMs,

      },

    }).catch(() => { });

  });

  next();

});



// Serve static files from the 'public' directory

const publicDir = path.join(__dirname, '../public');

app.use(express.static(publicDir));



// Health check

app.get('/health', (_req, res) => {

  res.json({ status: 'ok' });

});



// Render и другие платформы часто проверяют корень сервиса через GET/HEAD /.

// Возвращаем простой 200, чтобы не получать ложные 404 в логах деплоя.

app.head('/', (_req, res) => {

  res.status(200).end();

});



app.get('/', (_req, res) => {

  res.status(200).json({

    service: 'givkoin-backend',

    status: 'ok',

  });

});



// Upload endpoint

app.post('/api/upload', uploadRateLimit, auth, adminAuth, (req, res) => {

  if (!req.files || Object.keys(req.files).length === 0) {

    return res.status(400).json({ message: 'No files were uploaded.' });

  }



  const file = req.files.file; // 'file' is the name of the input field

  if (Array.isArray(file)) {

    return res.status(400).json({ message: 'Upload only one file at a time.' });

  }



  const originalName = String(file.name || '').trim();

  const extension = path.extname(originalName).toLowerCase();

  const mimeType = String(file.mimetype || '').toLowerCase();

  if (!ALLOWED_UPLOAD_MIME_TYPES.has(mimeType) || !ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {

    return res.status(400).json({ message: 'Недопустимый тип файла' });

  }



  const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

  const uploadDir = path.join(publicDir, 'uploads');



  // Ensure upload directory exists

  if (!fs.existsSync(uploadDir)) {

    fs.mkdirSync(uploadDir, { recursive: true });

  }



  const safeFileName = `${uniqueSuffix}${extension}`;

  const uploadPath = path.join(uploadDir, safeFileName);



  file.mv(uploadPath, (err) => {

    if (err) {

      return res.status(500).json({ message: err.message });

    }



    // IMPORTANT: This URL assumes the backend is running on the same domain as the frontend or proxied.

    // For local dev, it will be something like http://localhost:3001/uploads/filename.jpg

    const fileUrl = `/uploads/${safeFileName}`;

    res.json({ url: fileUrl });

  });

});



// API Routes

app.use('/auth/login', loginRateLimit);

app.use('/auth/forgot-password', passwordRecoveryRateLimit);

app.use('/auth/reset-password', passwordRecoveryRateLimit);

app.use('/auth', authRoutes);

app.use('/match', matchRoutes);

app.use('/appeals', appealRoutes);

app.use('/referrals', referralRoutes);

app.use('/news', newsRoutes);

app.use('/wishes', wishRoutes);

app.use('/admin', adminRoutes);

app.use('/tree', treeRoutes);

app.use('/tree/solar', solarRoutes);

app.use('/fortune', fortuneRoutes);

app.use('/entity', entityRoutes);

app.use('/bridges', bridgeRoutes);

app.use('/battles', battleRoutes);
app.use('/ads', adsRoutes);
app.use('/ad-boosts', adBoostRoutes);
app.use('/chats', chatRoutes);
app.use('/activity', activityRoutes);

app.use('/chronicle', chronicleRoutes);

app.use('/evil-root', evilRootRoutes);

app.use('/notifications', require('./routes/notifications'));

app.use('/meditation', meditationRoutes);

app.use('/shop', shopRoutes);

app.use('/warehouse', warehouseRoutes);

app.use('/feedback', feedbackRoutes);

app.use('/pages', pagesRoutes);

app.use('/achievements', achievementsRoutes);

app.use('/night-shift', nightShiftRoutes);

app.use('/crystal', require('./routes/crystal'));

app.use('/meta', metaRoutes);

app.use('/daily-streak', dailyStreakRoutes);

app.use('/radiance', radianceRoutes);

app.use('/economy', economyRoutes);

app.use('/practice', practiceRoutes);



// Public quote endpoint

app.get('/quotes/active', quoteController.getActiveQuote);



// 404 handler with persistent event logging

app.use((req, res, _next) => {

  logSystemErrorEvent({

    req,

    eventType: 'not_found',

    statusCode: 404,

    message: 'Route not found',

  }).catch(() => { });

  res.status(404).json({ message: 'Маршрут не найден' });

});



// Error Handler

app.use(errorHandler);



const startServer = async () => {

  try {

    if (serverStarted) return;

    const PORT = Number(process.env.PORT) || 10000;

    await connectDB();

    await ensureBootstrapAdminFromEnv(logger);

    registerCronJobs();

    ioInstance = await initSocket(server);

    app.set('io', ioInstance);

    server.listen(PORT, () => {

      serverStarted = true;

      logger.info('Backend started', { port: PORT });

    });

  } catch (error) {

    logger.error('Failed to start server', error);

    process.exit(1);

  }

};



const shutdownServer = async (signal = 'shutdown') => {

  if (shuttingDown) return;

  shuttingDown = true;



  logger.info('Shutting down backend', { signal });



  await Promise.allSettled([

    new Promise((resolve) => {

      if (!serverStarted) return resolve();

      server.close(() => {

        serverStarted = false;

        resolve();

      });

    }),

    new Promise((resolve) => {

      if (!ioInstance) return resolve();

      ioInstance.close(() => {

        ioInstance = null;

        resolve();

      });

    }),

  ]);



  await closeSocketAdapter();

};



if (!global.__givkoinProcessHandlersRegistered) {

  global.__givkoinProcessHandlersRegistered = true;

  process.on('unhandledRejection', (reason) => {

    logger.error('Unhandled promise rejection', reason);

  });

  process.on('uncaughtException', (error) => {

    logger.error('Uncaught exception', error);

    process.exit(1);

  });

  process.on('SIGINT', () => {

    shutdownServer('SIGINT')

      .catch((error) => logger.error('SIGINT shutdown failed', error))

      .finally(() => process.exit(0));

  });

  process.on('SIGTERM', () => {

    shutdownServer('SIGTERM')

      .catch((error) => logger.error('SIGTERM shutdown failed', error))

      .finally(() => process.exit(0));

  });

}



if (require.main === module) {

  startServer();

}



module.exports = app;

module.exports.startServer = startServer;

module.exports.server = server;

module.exports.shutdownServer = shutdownServer;



