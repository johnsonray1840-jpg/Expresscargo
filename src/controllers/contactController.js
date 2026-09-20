const { enqueueEmail } = require('../services/emailDispatcher');
const { sendSuccess, sendError, AppError } = require('../utils/apiResponse');
const { SystemSetting } = require('../models');
const { parseFromAddress } = require('../config/email');

/**
 * Handle Contact Message Form Submission
 * POST /api/contact
 */
exports.submitContact = async (req, res, next) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !message) {
      return sendError(res, 400, 'MISSING_FIELDS', 'Name, email, and message are required.');
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendError(res, 400, 'INVALID_EMAIL', 'Please provide a valid email address.');
    }

    // Get admin notification email setting
    const adminEmailSetting = await SystemSetting.findOne({ key: 'admin_notification_email' });
    const fallbackEmail = parseFromAddress(process.env.EMAIL_FROM || process.env.SMTP_FROM).address;
    const recipientEmail = adminEmailSetting?.value || fallbackEmail || 'support@vertexcapitals.ltd';

    // Queue email to admin
    await enqueueEmail({
      to: recipientEmail,
      replyTo: email,
      subject: `[Contact Form] ${subject || 'New Inquiry'} from ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #0B1F3A; border-bottom: 2px solid #D97706; padding-bottom: 8px;">New Customer Contact Message</h2>
          <p><strong>Full Name:</strong> ${name}</p>
          <p><strong>Email Address:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
          <p><strong>Subject:</strong> ${subject || 'General Inquiry'}</p>
          <div style="margin-top: 15px; padding: 15px; background: #f8fafc; border-left: 4px solid #0B1F3A; border-radius: 6px;">
            <p style="margin: 0; white-space: pre-line;">${message}</p>
          </div>
        </div>
      `
    });

    return sendSuccess(res, {
      message: 'Thank you for reaching out! Your message has been received and our team will get back to you shortly.'
    }, 200);
  } catch (error) {
    next(error);
  }
};

/**
 * Handle Quote Request Form Submission
 * POST /api/contact/quote
 */
exports.submitQuote = async (req, res, next) => {
  try {
    const { fright_type, freight_type, email, departure_country, recipient_country, weight, expected_delivery_date, details } = req.body;
    const freightType = fright_type || freight_type;

    if (!email || !departure_country || !recipient_country) {
      return sendError(res, 400, 'MISSING_FIELDS', 'Email, departure country, and recipient country are required.');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendError(res, 400, 'INVALID_EMAIL', 'Please provide a valid email address.');
    }

    const adminEmailSetting = await SystemSetting.findOne({ key: 'admin_notification_email' });
    const fallbackEmail = parseFromAddress(process.env.EMAIL_FROM || process.env.SMTP_FROM).address;
    const recipientEmail = adminEmailSetting?.value || fallbackEmail || 'support@vertexcapitals.ltd';

    await enqueueEmail({
      to: recipientEmail,
      replyTo: email,
      subject: `[Quote Request] ${freightType || 'Freight'} (${departure_country} -> ${recipient_country})`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #0B1F3A; border-bottom: 2px solid #D97706; padding-bottom: 8px;">New Quote Request</h2>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Freight Type:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${freightType || 'Standard'}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Client Email:</td><td style="padding: 8px; border-bottom: 1px solid #eee;"><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Origin:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${departure_country}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Destination:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${recipient_country}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Estimated Weight:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${weight || 'N/A'} KG</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Expected Date:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${expected_delivery_date || 'Flexible'}</td></tr>
          </table>
          ${details ? `<div style="margin-top: 15px; padding: 15px; background: #f8fafc; border-left: 4px solid #D97706; border-radius: 6px;"><p style="margin:0;"><strong>Additional Notes:</strong><br/>${details}</p></div>` : ''}
        </div>
      `
    });

    return sendSuccess(res, {
      message: 'Quote request submitted successfully. Our logistics specialists will email you a tailored quote shortly.'
    }, 200);
  } catch (error) {
    next(error);
  }
};
