require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const errorHandler = require('./middleware/errorHandler');
const mongoSanitizer = require('./middleware/mongoSanitize');
const { apiLimiter } = require('./middleware/rateLimiter');

// Initialize Express App
const app = express();

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabled so CDN scripts/styles in static frontend run freely
    crossOriginEmbedderPolicy: false
  })
);

// High-Efficiency Gzip Compression
app.use(compression());

// Logging in Development
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// CORS Whitelist
const allowedOrigins = (process.env.CLIENT_URL || '*').split(',').map((s) => s.trim());
app.use(
  cors({
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  })
);

// Body Parsers with Safe Memory Limits for Shared Hosting
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// NoSQL Query Injection Sanitizer
app.use(mongoSanitizer);

// Rate Limiter for API Endpoints
app.use('/api', apiLimiter);

// Mounted API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/tracking', require('./routes/trackingRoutes'));
app.use('/api/shipments', require('./routes/shipmentRoutes'));
app.use('/api/packages', require('./routes/packageRoutes'));
app.use('/api/settings', require('./routes/settingRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/contact', require('./routes/contactRoutes'));

// Health Check Endpoints (Zero credentials/secrets exposed)
app.get(['/health', '/api/health'], (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy'
  });
});

// Serve Frontend Static Assets with HTML Extension Resolution
app.use(express.static(path.join(__dirname, '..'), { extensions: ['html', 'htm'] }));

// Explicit Clean URL Page Routes
app.get(['/', '/index'], (req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));
app.get(['/login', '/admin/login'], (req, res) => res.sendFile(path.join(__dirname, '..', 'login.html')));
app.get(['/admin', '/admin/dashboard', '/dashboard'], (req, res) => res.sendFile(path.join(__dirname, '..', 'admin.html')));
app.get('/api/auth/login', (req, res) => res.redirect('/login'));
app.get(['/order', '/tracking', '/track'], (req, res) => res.sendFile(path.join(__dirname, '..', 'order.html')));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, '..', 'about.html')));
app.get('/services', (req, res) => res.sendFile(path.join(__dirname, '..', 'services.html')));
app.get('/diplomatic', (req, res) => res.sendFile(path.join(__dirname, '..', 'diplomatic.html')));
app.get(['/request-quote', '/quote'], (req, res) => res.sendFile(path.join(__dirname, '..', 'request-quote.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, '..', 'contact.html')));

// Centralized Error Handler
app.use(errorHandler);

module.exports = app;

