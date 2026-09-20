const https = require('https');
const nodemailer = require('nodemailer');
const SystemSetting = require('../models/SystemSetting');
const logger = require('../utils/logger');

let cachedTransporter = null;
let cachedConfigTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache for DB settings

/**
 * Format 'From' string properly: e.g. "Express-Cargo" <no_reply@vertexcapitals.ltd>
 */
const formatFromAddress = (name, email) => {
  const cleanEmail = (email || '').replace(/[<>]/g, '').trim();
  const cleanName = (name || '').replace(/["']/g, '').trim();
  if (cleanName && cleanEmail) {
    return `"${cleanName}" <${cleanEmail}>`;
  }
  return cleanEmail || '"Express-Cargo" <no_reply@vertexcapitals.ltd>';
};

/**
 * Parse a raw from header or string into name & address
 */
const parseFromAddress = (rawFrom) => {
  if (!rawFrom) {
    return {
      name: process.env.EMAIL_FROM_NAME || 'Express-Cargo',
      address: process.env.EMAIL_FROM_ADDRESS || 'no_reply@vertexcapitals.ltd'
    };
  }
  const match = rawFrom.match(/(?:"?([^"]*)"?\s)?(?:<?(.+@[^>]+)>?)/);
  if (match) {
    return {
      name: (match[1] || process.env.EMAIL_FROM_NAME || 'Express-Cargo').trim(),
      address: (match[2] || process.env.EMAIL_FROM_ADDRESS || 'no_reply@vertexcapitals.ltd').trim()
    };
  }
  return {
    name: process.env.EMAIL_FROM_NAME || 'Express-Cargo',
    address: rawFrom.trim()
  };
};

/**
 * Fetch active email configuration from DB (SystemSetting) with fallback to process.env
 */
const getActiveEmailConfig = async () => {
  const envParsedFrom = parseFromAddress(process.env.EMAIL_FROM);
  const defaultFromName = process.env.EMAIL_FROM_NAME || envParsedFrom.name || 'Express-Cargo';
  const defaultFromEmail = process.env.EMAIL_FROM_ADDRESS || envParsedFrom.address || 'no_reply@vertexcapitals.ltd';
  const defaultResendKey = process.env.RESEND_API_KEY || (process.env.SMTP_PASSWORD && process.env.SMTP_PASSWORD.startsWith('re_') ? process.env.SMTP_PASSWORD : '');

  try {
    const setting = await SystemSetting.findOne({ key: 'email_config' }).lean();
    if (setting && setting.value) {
      const val = setting.value;
      const resendApiKey = val.resendApiKey || (val.provider === 'resend' ? val.smtpPass : '') || defaultResendKey;
      return {
        provider: val.provider || (resendApiKey ? 'resend' : 'smtp'),
        resendApiKey: resendApiKey,
        host: val.smtpHost || (resendApiKey ? 'smtp.resend.com' : (process.env.SMTP_HOST || 'smtp.resend.com')),
        port: parseInt(val.smtpPort || process.env.SMTP_PORT || '465', 10),
        secure: val.secure !== undefined ? Boolean(val.secure) : true,
        user: val.smtpUser || (resendApiKey ? 'resend' : (process.env.SMTP_USER || 'resend')),
        pass: val.smtpPass || resendApiKey || process.env.SMTP_PASSWORD || '',
        fromName: val.fromName || defaultFromName,
        fromEmail: val.fromEmail || defaultFromEmail,
        formattedFrom: formatFromAddress(val.fromName || defaultFromName, val.fromEmail || defaultFromEmail)
      };
    }
  } catch (err) {
    logger.warn('Failed to fetch email settings from DB, using env fallback:', err.message);
  }

  // Fallback to environment variables
  return {
    provider: defaultResendKey ? 'resend' : 'smtp',
    resendApiKey: defaultResendKey,
    host: process.env.SMTP_HOST || 'smtp.resend.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465' || !process.env.SMTP_PORT,
    user: process.env.SMTP_USER || (defaultResendKey ? 'resend' : ''),
    pass: process.env.SMTP_PASSWORD || defaultResendKey || '',
    fromName: defaultFromName,
    fromEmail: defaultFromEmail,
    formattedFrom: formatFromAddress(defaultFromName, defaultFromEmail)
  };
};

/**
 * Invalidate cached transporter when admin updates SMTP/Resend settings
 */
const invalidateTransporterCache = () => {
  cachedTransporter = null;
  cachedConfigTimestamp = 0;
};

/**
 * Send email using Resend REST API (HTTPS endpoint: https://api.resend.com/emails)
 * Extremely reliable, works on all cloud and cPanel shared hosts without SMTP port blocks.
 */
const sendViaResendApi = async ({ apiKey, from, to, subject, html, text, replyTo }) => {
  if (!apiKey) {
    throw new Error('Resend API key is missing');
  }

  const recipients = Array.isArray(to) ? to : [to];
  const payload = {
    from,
    to: recipients,
    subject,
    html: html || (text ? `<p>${text}</p>` : ''),
    text: text || (html ? html.replace(/<[^>]*>?/gm, '') : '')
  };

  if (replyTo) {
    payload.reply_to = replyTo;
  }

  // Use global fetch if available (Node 18+), else fallback to native https request
  if (typeof fetch === 'function') {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      const errMsg = (data && (data.message || data.error)) || `Resend API returned status ${response.status}`;
      throw new Error(errMsg);
    }
    return {
      messageId: data.id || `resend-${Date.now()}`
    };
  }

  // Native HTTPS fallback
  return new Promise((resolve, reject) => {
    const dataString = JSON.stringify(payload);
    const options = {
      hostname: 'api.resend.com',
      port: 443,
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataString)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ messageId: parsed.id || `resend-${Date.now()}` });
          } else {
            reject(new Error(parsed.message || parsed.error || `HTTP ${res.statusCode}: ${body}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ messageId: `resend-${Date.now()}` });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(dataString);
    req.end();
  });
};

/**
 * Get dynamic Nodemailer transporter (Fallback / Custom SMTP)
 */
const getTransporter = async (forceRefresh = false) => {
  const now = Date.now();
  if (cachedTransporter && !forceRefresh && (now - cachedConfigTimestamp < CACHE_TTL_MS)) {
    return cachedTransporter;
  }

  const config = await getActiveEmailConfig();
  const isConfigured = !!(config.host && (config.user || config.resendApiKey) && (config.pass || config.resendApiKey));

  if (!isConfigured) {
    logger.warn('Email credentials not fully configured. Using mock transporter in non-production.');
    cachedTransporter = {
      sendMail: async (opts) => {
        logger.info(`[MOCK EMAIL DISPATCH] To: ${opts.to} | Subject: ${opts.subject}`);
        return { messageId: `mock-${Date.now()}` };
      },
      verify: async () => true
    };
    cachedConfigTimestamp = now;
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: config.host || 'smtp.resend.com',
    port: config.port || 465,
    secure: config.secure,
    auth: {
      user: config.user || 'resend',
      pass: config.pass || config.resendApiKey
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production'
    }
  });

  cachedConfigTimestamp = now;
  return cachedTransporter;
};

/**
 * Unified Outbound Sender: Prefers Resend REST API when API key is present,
 * with graceful fallback to Nodemailer SMTP.
 */
const sendOutboundEmail = async ({ to, subject, html, text, from, replyTo }) => {
  const config = await getActiveEmailConfig();
  const resolvedFrom = from || config.formattedFrom || formatFromAddress(config.fromName, config.fromEmail);
  const resendApiKey = config.resendApiKey || (config.pass && config.pass.startsWith('re_') ? config.pass : null);

  // 1. Try Resend REST API (fastest, most robust)
  if (resendApiKey) {
    try {
      const result = await sendViaResendApi({
        apiKey: resendApiKey,
        from: resolvedFrom,
        to,
        subject,
        html,
        text,
        replyTo
      });
      return result;
    } catch (apiError) {
      logger.warn(`Resend REST API attempt failed (${apiError.message}), attempting SMTP fallback...`);
    }
  }

  // 2. Fallback to Nodemailer (Resend SMTP or custom host)
  const transporter = await getTransporter();
  const mailOptions = {
    from: resolvedFrom,
    to,
    subject,
    text: text || (html ? html.replace(/<[^>]*>?/gm, '') : ''),
    html
  };
  if (replyTo) mailOptions.replyTo = replyTo;

  const info = await transporter.sendMail(mailOptions);
  return { messageId: info.messageId || `msg-${Date.now()}` };
};

module.exports = {
  getActiveEmailConfig,
  getTransporter,
  sendViaResendApi,
  sendOutboundEmail,
  formatFromAddress,
  parseFromAddress,
  invalidateTransporterCache
};
