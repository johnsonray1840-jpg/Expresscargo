const nodemailer = require('nodemailer');
const SystemSetting = require('../models/SystemSetting');
const AuditLog = require('../models/AuditLog');
const EmailLog = require('../models/EmailLog');
const { getActiveEmailConfig, invalidateTransporterCache, sendOutboundEmail, formatFromAddress } = require('../config/email');
const { triggerSyncEmail } = require('../services/emailDispatcher');
const logger = require('../utils/logger');

/**
 * @desc    Get Current Email & SMTP / Resend Configuration (Password / Key masked)
 * @route   GET /api/settings/email
 * @access  Private/Admin
 */
const getEmailSettings = async (req, res, next) => {
  try {
    const setting = await SystemSetting.findOne({ key: 'email_config' }).populate('updatedBy', 'name email').lean();
    const envConfig = await getActiveEmailConfig();

    if (!setting || !setting.value) {
      return res.status(200).json({
        success: true,
        data: {
          provider: envConfig.provider || 'resend',
          smtpHost: envConfig.host || 'smtp.resend.com',
          smtpPort: envConfig.port || 465,
          smtpUser: envConfig.user || 'resend',
          secure: envConfig.secure,
          fromName: envConfig.fromName || 'Express-Cargo',
          fromEmail: envConfig.fromEmail || 'no_reply@vertexcapitals.ltd',
          isPasswordSet: Boolean(envConfig.pass || envConfig.resendApiKey),
          source: 'environment',
          updatedAt: null,
          updatedBy: null
        }
      });
    }

    const val = setting.value;
    return res.status(200).json({
      success: true,
      data: {
        provider: val.provider || (val.resendApiKey ? 'resend' : 'smtp'),
        smtpHost: val.smtpHost || 'smtp.resend.com',
        smtpPort: parseInt(val.smtpPort || '465', 10),
        smtpUser: val.smtpUser || 'resend',
        secure: val.secure !== undefined ? Boolean(val.secure) : true,
        fromName: val.fromName || 'Express-Cargo',
        fromEmail: val.fromEmail || 'no_reply@vertexcapitals.ltd',
        isPasswordSet: Boolean(val.smtpPass || val.resendApiKey || envConfig.resendApiKey),
        source: 'database',
        updatedAt: setting.updatedAt,
        updatedBy: setting.updatedBy
      }
    });
  } catch (error) {
    logger.error('Failed to get email settings:', error);
    next(error);
  }
};

/**
 * @desc    Update Email & Resend / SMTP Configuration
 * @route   PUT /api/settings/email
 * @access  Private/Admin
 */
const updateEmailSettings = async (req, res, next) => {
  try {
    const {
      provider = 'resend',
      resendApiKey,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      fromName,
      fromEmail,
      secure
    } = req.body;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanFromEmail = (fromEmail || 'no_reply@vertexcapitals.ltd').trim().toLowerCase();
    if (fromEmail && !emailRegex.test(cleanFromEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid fromEmail address'
      });
    }

    let existingSetting = await SystemSetting.findOne({ key: 'email_config' });
    let resolvedPassword = '';
    let resolvedResendApiKey = (resendApiKey || '').trim();

    if (smtpPass && smtpPass.trim()) {
      resolvedPassword = smtpPass.trim();
    } else if (existingSetting && existingSetting.value && existingSetting.value.smtpPass) {
      resolvedPassword = existingSetting.value.smtpPass;
    } else {
      resolvedPassword = process.env.SMTP_PASSWORD || process.env.RESEND_API_KEY || '';
    }

    if (!resolvedResendApiKey && existingSetting && existingSetting.value && existingSetting.value.resendApiKey) {
      resolvedResendApiKey = existingSetting.value.resendApiKey;
    } else if (!resolvedResendApiKey) {
      resolvedResendApiKey = process.env.RESEND_API_KEY || (resolvedPassword.startsWith('re_') ? resolvedPassword : '');
    }

    const parsedPort = parseInt(smtpPort || '465', 10);
    const parsedSecure = secure !== undefined ? Boolean(secure) : (parsedPort === 465);

    const settingValue = {
      provider: provider === 'smtp' ? 'smtp' : 'resend',
      resendApiKey: resolvedResendApiKey,
      smtpHost: (smtpHost || 'smtp.resend.com').trim(),
      smtpPort: parsedPort,
      smtpUser: (smtpUser || 'resend').trim(),
      smtpPass: resolvedPassword,
      fromName: (fromName || 'Express-Cargo').trim(),
      fromEmail: cleanFromEmail,
      secure: parsedSecure
    };

    const updatedSetting = await SystemSetting.findOneAndUpdate(
      { key: 'email_config' },
      {
        key: 'email_config',
        value: settingValue,
        category: 'email',
        description: 'Resend & Outbound Email Delivery Configuration',
        updatedBy: req.user ? req.user._id : null
      },
      { upsert: true, new: true, runValidators: true }
    );

    // Invalidate memory cache so subsequent email dispatches use new credentials
    invalidateTransporterCache();

    // Audit log
    await AuditLog.create({
      action: 'UPDATE_EMAIL_SETTINGS',
      actor: req.user ? req.user._id : null,
      actorRole: req.user ? req.user.role : 'admin',
      targetModel: 'SystemSetting',
      targetId: updatedSetting._id,
      details: {
        provider: settingValue.provider,
        smtpHost: settingValue.smtpHost,
        fromName: settingValue.fromName,
        fromEmail: settingValue.fromEmail,
        passwordUpdated: Boolean(smtpPass || resendApiKey)
      },
      ipAddress: req.ip || req.connection?.remoteAddress
    }).catch((err) => logger.warn('AuditLog creation failed:', err.message));

    return res.status(200).json({
      success: true,
      message: 'Email settings successfully updated',
      data: {
        provider: settingValue.provider,
        smtpHost: settingValue.smtpHost,
        smtpPort: settingValue.smtpPort,
        smtpUser: settingValue.smtpUser,
        fromName: settingValue.fromName,
        fromEmail: settingValue.fromEmail,
        secure: settingValue.secure,
        isPasswordSet: Boolean(resolvedPassword || resolvedResendApiKey),
        source: 'database',
        updatedAt: updatedSetting.updatedAt
      }
    });
  } catch (error) {
    logger.error('Failed to update email settings:', error);
    next(error);
  }
};

/**
 * @desc    Test Outbound Email Delivery (Resend API / SMTP Connection)
 * @route   POST /api/settings/email/test
 * @access  Private/Admin
 */
const testEmailSettings = async (req, res, next) => {
  try {
    const { testEmail, resendApiKey, smtpHost, smtpPort, smtpUser, smtpPass, fromName, fromEmail } = req.body;

    const recipient = testEmail || (req.user && req.user.email);
    if (!recipient) {
      return res.status(400).json({
        success: false,
        message: 'Recipient email address (testEmail) is required'
      });
    }

    const testSubject = '✅ Express Cargo - Resend Email Delivery Verified';
    const testHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #10b981; border-radius: 12px; background: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #0B1F3A; margin: 0; font-size: 22px;">Express Cargo</h2>
          <span style="font-size: 13px; color: #10b981; font-weight: bold; background: #ecfdf5; padding: 4px 12px; border-radius: 999px; display: inline-block; margin-top: 8px;">
            Resend Email Delivery Verified
          </span>
        </div>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">Hello Administrator,</p>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          This is a test notification confirming that your <strong>Resend</strong> email dispatch integration is active and operating seamlessly for <strong>Express Cargo</strong>.
        </p>
        <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 14px; margin: 20px 0; border-radius: 6px;">
          <p style="margin: 0; color: #065f46; font-size: 13px;"><strong>Dispatched At:</strong> ${new Date().toUTCString()}</p>
          <p style="margin: 6px 0 0 0; color: #065f46; font-size: 13px;"><strong>Provider:</strong> Resend Unified Engine</p>
        </div>
        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 24px;">&copy; Express Cargo Global Operations</p>
      </div>
    `;

    let customFrom = null;
    if (fromName || fromEmail) {
      customFrom = formatFromAddress(fromName || 'Express-Cargo', fromEmail || 'no_reply@vertexcapitals.ltd');
    }

    const result = await sendOutboundEmail({
      to: recipient,
      subject: testSubject,
      html: testHtml,
      from: customFrom
    });

    // Record to EmailLog
    await EmailLog.create({
      recipient: recipient,
      recipientEmail: recipient,
      subject: testSubject,
      event: 'RESEND_TEST_VERIFICATION',
      template: 'custom',
      status: 'sent',
      sentAt: new Date(),
      messageId: result.messageId || 'test-dispatch'
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: `Test email successfully dispatched to ${recipient}`,
      messageId: result.messageId
    });
  } catch (error) {
    logger.error('Resend test email failed:', error);
    return res.status(500).json({
      success: false,
      message: `Email delivery verification failed: ${error.message}`,
      error: error.message
    });
  }
};

/**
 * @desc    Get Paginated Outbound Email Logs
 * @route   GET /api/settings/emails/logs
 * @access  Private/Admin
 */
const getEmailLogs = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.recipient) {
      filter.recipient = { $regex: req.query.recipient, $options: 'i' };
    }
    if (req.query.trackingNumber) {
      filter.trackingNumber = req.query.trackingNumber.toUpperCase();
    }
    if (req.query.event) {
      filter.event = req.query.event;
    }

    const [logs, total] = await Promise.all([
      EmailLog.find(filter)
        .populate('shipment', 'trackingNumber status origin destination')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EmailLog.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Failed to get email logs:', error);
    next(error);
  }
};

/**
 * @desc    Retry Dispatching a Failed Email
 * @route   POST /api/settings/emails/logs/:id/retry
 * @access  Private/Admin
 */
const retryEmailLog = async (req, res, next) => {
  try {
    const log = await EmailLog.findById(req.params.id);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Email log entry not found'
      });
    }

    const result = await triggerSyncEmail({
      to: log.recipient || log.recipientEmail,
      subject: log.subject,
      text: `Retry dispatch for ${log.subject}`,
      template: log.template,
      event: log.event,
      shipmentId: log.shipment,
      trackingNumber: log.trackingNumber,
      logId: log._id
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: `Email successfully re-dispatched to ${log.recipient}`,
        data: result
      });
    } else {
      return res.status(500).json({
        success: false,
        message: `Retry dispatch failed: ${result.error}`,
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Failed to retry email log:', error);
    next(error);
  }
};

module.exports = {
  getEmailSettings,
  updateEmailSettings,
  testEmailSettings,
  getEmailLogs,
  retryEmailLog
};
