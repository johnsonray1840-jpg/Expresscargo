const { triggerAsyncEmail, triggerSyncEmail, enqueueEmail } = require('./emailDispatcher');
const { renderMilestoneEmailHtml } = require('../emails/templates');
const { calculateMilestoneStage, calculateServerProgress } = require('../utils/timeCalculator');
const logger = require('../utils/logger');

/**
 * Universal email dispatcher (sync or async background queue)
 */
const sendEmail = async ({
  to,
  subject,
  html,
  text,
  from,
  replyTo,
  template = 'custom',
  event = 'GENERAL_NOTIFICATION',
  shipmentId = null,
  trackingNumber = null,
  async = false
}) => {
  const payload = {
    to,
    subject,
    html,
    text,
    from,
    replyTo,
    template,
    event,
    shipmentId,
    trackingNumber
  };

  if (async) {
    triggerAsyncEmail(payload);
    return { queued: true };
  }

  return await triggerSyncEmail(payload);
};

/**
 * Send Dual-Party Milestone Notification (Sender & Recipient)
 * Luxury, realistic, and soothing international courier alert dispatched via Resend
 */
const sendMilestoneAlertToBothParties = (shipment, milestoneTitle, milestoneMessage, progress = null) => {
  if (!shipment) return;

  const currentProgress = progress !== null ? progress : calculateServerProgress(shipment);
  const milestoneStage = calculateMilestoneStage(currentProgress, shipment.status);

  const emailSubject = `[${shipment.trackingNumber}] Milestone Alert: ${milestoneTitle || milestoneStage.name}`;
  const html = renderMilestoneEmailHtml({
    shipment,
    milestoneTitle: milestoneTitle || `Consignment Milestone: ${milestoneStage.name}`,
    milestoneMessage: milestoneMessage || milestoneStage.description,
    milestoneStage,
    progressPercentage: currentProgress
  });

  const recipients = new Set();
  if (shipment.recipient && shipment.recipient.email && shipment.recipient.email.includes('@')) {
    recipients.add(shipment.recipient.email.trim().toLowerCase());
  }
  if (shipment.sender && shipment.sender.email && shipment.sender.email.includes('@')) {
    recipients.add(shipment.sender.email.trim().toLowerCase());
  }

  recipients.forEach((email) => {
    sendEmail({
      to: email,
      subject: emailSubject,
      html,
      template: 'milestone_update',
      event: `MILESTONE_${milestoneStage.id.toUpperCase()}`,
      shipmentId: shipment._id,
      trackingNumber: shipment.trackingNumber,
      async: true
    });
  });

  logger.info(`[DUAL-PARTY MILESTONE EMAIL TRIGGERED] Tracking: ${shipment.trackingNumber} | Stage: ${milestoneStage.name} | Recipients: ${Array.from(recipients).join(', ')}`);
};

/**
 * Send Shipment Status Alert (Wrapper calling Dual-Party Milestone System)
 */
const sendShipmentStatusAlert = (shipment, statusTitle, statusMessage) => {
  return sendMilestoneAlertToBothParties(shipment, statusTitle, statusMessage);
};

/**
 * Send Email Verification Token
 */
const sendVerificationEmail = async (user, token) => {
  const verifyUrl = `${process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',')[0] : 'https://express-cargo.ltd'}/api/auth/verify-email/${token}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="border-bottom: 2px solid #0B1F3A; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="color: #0B1F3A; margin: 0;">Express Cargo</h2>
        <span style="font-size: 12px; color: #64748b;">Global Account Services</span>
      </div>
      <p style="font-size: 14px; color: #334155;">Hello <strong>${user.name}</strong>,</p>
      <p style="font-size: 14px; color: #334155;">Thank you for registering with <strong>Express Cargo</strong>. Please confirm your email address by clicking the button below:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" style="background: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Verify Email Address</a>
      </div>
      <p style="color: #64748b; font-size: 12px;">If you didn't create an account with Express Cargo, you can safely ignore this email.</p>
    </div>
  `;

  return sendEmail({
    to: user.email,
    subject: 'Verify Your Express Cargo Account',
    html,
    template: 'custom',
    event: 'USER_VERIFY_EMAIL',
    async: false
  });
};

/**
 * Send Password Reset Token
 */
const sendPasswordResetEmail = async (user, token) => {
  const resetUrl = `${process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',')[0] : 'https://express-cargo.ltd'}/reset-password.html?token=${token}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="border-bottom: 2px solid #0B1F3A; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="color: #0B1F3A; margin: 0;">Express Cargo</h2>
        <span style="font-size: 12px; color: #64748b;">Security &amp; Password Recovery</span>
      </div>
      <p style="font-size: 14px; color: #334155;">Hello <strong>${user.name}</strong>,</p>
      <p style="font-size: 14px; color: #334155;">You recently requested to reset your password for your Express Cargo account. Click the button below to proceed:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
      </div>
      <p style="color: #64748b; font-size: 12px;">This link is valid for 60 minutes. If you did not make this request, please contact support immediately.</p>
    </div>
  `;

  return sendEmail({
    to: user.email,
    subject: 'Password Reset Instructions - Express Cargo',
    html,
    template: 'custom',
    event: 'USER_PASSWORD_RESET',
    async: false
  });
};

module.exports = {
  sendEmail,
  enqueueEmail,
  sendMilestoneAlertToBothParties,
  sendShipmentStatusAlert,
  sendVerificationEmail,
  sendPasswordResetEmail
};
