const logger = require('../utils/logger');
const { logSystemErrorEvent } = require('../services/systemErrorService');

const errorHandler = (err, req, res, _next) => {
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  const isBusinessError = statusCode >= 400 && statusCode < 500;
  const eventType = statusCode >= 500 ? 'server_error' : 'business_error';

  logger.error('Request failed', {
    method: req?.method,
    path: req?.originalUrl || req?.url,
    statusCode,
    message,
    stack: err?.stack,
  });

  if (statusCode >= 500 || isBusinessError) {
    logSystemErrorEvent({
      req,
      eventType,
      statusCode,
      message,
      stack: err?.stack || '',
      meta: {
        code: err?.code || null,
      },
    }).catch(() => { });
  }

  const payload = { message };
  if (process.env.NODE_ENV !== 'production') {
    payload.stack = err.stack;
  }

  res.status(statusCode).json(payload);
};

module.exports = errorHandler;
