/**
 * Lightweight NoSQL Query Injection Sanitizer
 * Strips MongoDB operator keys ($gt, $ne, $where, etc.) from req.body, req.query, and req.params
 * Shared hosting friendly: zero external dependency
 */
const sanitizeObject = (target) => {
  if (!target || typeof target !== 'object') return target;

  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i++) {
      target[i] = sanitizeObject(target[i]);
    }
    return target;
  }

  for (const key of Object.keys(target)) {
    // Prohibit keys that start with $ (MongoDB query operators) or contain .
    if (key.startsWith('$') || key.includes('.')) {
      delete target[key];
    } else if (typeof target[key] === 'object') {
      target[key] = sanitizeObject(target[key]);
    }
  }

  return target;
};

const mongoSanitizer = (req, res, next) => {
  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);
  next();
};

module.exports = mongoSanitizer;

