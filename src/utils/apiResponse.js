/**
 * Custom Operational Application Error with Code
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Standardized Success Response Builder
 * Format: { "success": true, "data": ... }
 */
const sendSuccess = (res, data = {}, statusCode = 200, extra = {}) => {
  return res.status(statusCode).json({
    success: true,
    data,
    ...extra
  });
};

/**
 * Standardized Error Response Builder
 * Format: { "success": false, "error": { "code": "...", "message": "..." } }
 */
const sendError = (res, message = 'An error occurred', code = 'ERROR', statusCode = 400, details = null) => {
  const errorObj = {
    code: code.toUpperCase(),
    message
  };

  if (details && process.env.NODE_ENV !== 'production') {
    errorObj.details = details;
  }

  return res.status(statusCode).json({
    success: false,
    error: errorObj
  });
};

module.exports = {
  AppError,
  sendSuccess,
  sendError
};

