const logger = require('../utils/logger');

/**
 * Centralized production-grade error handling middleware
 * Guarantees consistent error format:
 * {
 *   "success": false,
 *   "error": {
 *     "code": "ERROR_CODE",
 *     "message": "Error message description"
 *   }
 * }
 */
const errorHandler = (err, req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';
  let statusCode = err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
  let errorCode = err.code && typeof err.code === 'string' && isNaN(Number(err.code)) ? err.code : 'SERVER_ERROR';
  let message = err.message || 'Internal Server Error';

  // Log error internally for server-side diagnosis
  logger.error(`[${req.method}] ${req.originalUrl} - ${err.message}`, isProduction ? undefined : err.stack);

  // Mongoose CastError (Invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 404;
    errorCode = 'RESOURCE_NOT_FOUND';
    message = `Resource not found with id: ${err.value}`;
  }

  // Mongoose Duplicate Key Error (code 11000)
  if (err.code === 11000) {
    statusCode = 400;
    errorCode = 'DUPLICATE_ENTRY';
    const field = Object.keys(err.keyValue || {})[0] || 'record';
    message = `Duplicate value entered for ${field}. Please use another value.`;
  }

  // Mongoose Validation Error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = Object.values(err.errors).map((val) => val.message).join(', ');
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired. Please log in again.';
  }

  // Multer File Upload Errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    errorCode = 'FILE_TOO_LARGE';
    message = 'Uploaded file exceeds the maximum 10MB limit.';
  }

  // Zod Validation Errors
  if (err.issues && Array.isArray(err.issues)) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
  }

  // Common Business Error Codes
  if (statusCode === 404 && errorCode === 'SERVER_ERROR') {
    errorCode = 'NOT_FOUND';
  }
  if (statusCode === 401 && errorCode === 'SERVER_ERROR') {
    errorCode = 'UNAUTHORIZED';
  }
  if (statusCode === 403 && errorCode === 'SERVER_ERROR') {
    errorCode = 'FORBIDDEN';
  }
  if (statusCode === 400 && errorCode === 'SERVER_ERROR') {
    errorCode = 'BAD_REQUEST';
  }

  // Standardized Error Response
  const responsePayload = {
    success: false,
    error: {
      code: errorCode.toUpperCase(),
      message
    }
  };

  if (!isProduction && err.stack) {
    responsePayload.error.stack = err.stack;
  }

  return res.status(statusCode).json(responsePayload);
};

module.exports = errorHandler;
