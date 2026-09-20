const { sendOutboundEmail, getActiveEmailConfig } = require('../config/email');
const EmailLog = require('../models/EmailLog');
const logger = require('../utils/logger');

/**
 * Lightweight In-Memory Queue for Shared Hosting & Cloud Environments
 * Safely rate-limits concurrent outbound dispatches to avoid socket exhaustion.
 */
class LightweightEmailQueue {
  constructor(concurrency = 3) {
    this.concurrency = concurrency;
    this.activeWorkers = 0;
    this.queue = [];
  }

  /**
   * Enqueue email job for non-blocking asynchronous background execution
   */
  enqueue(job) {
    this.queue.push(job);
    setImmediate(() => this.processNext());
  }

  async processNext() {
    if (this.activeWorkers >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    this.activeWorkers++;

    try {
      await this.executeJob(job);
    } catch (err) {
      logger.error('Unhandled error during background email job execution:', err.message);
    } finally {
      this.activeWorkers--;
      if (this.queue.length > 0) {
        setImmediate(() => this.processNext());
      }
    }
  }

  /**
   * Execute email delivery and record EmailLog
   */
  async executeJob({
    to,
    subject,
    html,
    text,
    from,
    replyTo,
    template = 'status_update',
    event = 'SHIPMENT_UPDATE',
    shipmentId = null,
    trackingNumber = null,
    logId = null
  }) {
    let emailLog;
    const recipientStr = Array.isArray(to) ? to.join(', ') : to;

    try {
      if (logId) {
        emailLog = await EmailLog.findById(logId);
      } else {
        emailLog = await EmailLog.create({
          shipment: shipmentId,
          trackingNumber: trackingNumber || '',
          recipient: recipientStr,
          recipientEmail: recipientStr,
          subject,
          event,
          template,
          status: 'queued',
          attempts: 0
        });
      }
    } catch (err) {
      logger.warn('Could not initialize EmailLog record:', err.message);
    }

    try {
      const result = await sendOutboundEmail({
        to,
        subject,
        html,
        text,
        from,
        replyTo
      });

      logger.info(`[RESEND/EMAIL SUCCESS] To: ${recipientStr} | Subject: "${subject}" | MsgId: ${result.messageId || 'N/A'}`);

      if (emailLog) {
        emailLog.status = 'sent';
        emailLog.sentAt = new Date();
        emailLog.messageId = result.messageId || '';
        emailLog.attempts = (emailLog.attempts || 0) + 1;
        emailLog.error = '';
        emailLog.errorMessage = '';
        await emailLog.save().catch(() => {});
      }

      return { success: true, messageId: result.messageId, logId: emailLog ? emailLog._id : null };
    } catch (error) {
      logger.error(`[RESEND/EMAIL FAILED] To: ${recipientStr} | Error: ${error.message}`);

      if (emailLog) {
        emailLog.status = 'failed';
        emailLog.error = error.message;
        emailLog.errorMessage = error.message;
        emailLog.attempts = (emailLog.attempts || 0) + 1;
        await emailLog.save().catch(() => {});
      }

      return { success: false, error: error.message, logId: emailLog ? emailLog._id : null };
    }
  }
}

// Singleton in-memory worker instance
const queueInstance = new LightweightEmailQueue(3);

/**
 * Universal Non-blocking Async Email Dispatcher
 */
const triggerAsyncEmail = (payload) => {
  queueInstance.enqueue(payload);
};

/**
 * Alias for triggerAsyncEmail (used in contactController and legacy modules)
 */
const enqueueEmail = (payload) => {
  queueInstance.enqueue(payload);
};

/**
 * Synchronous / Awaitable Email Dispatcher for critical paths (e.g. password resets, tests)
 */
const triggerSyncEmail = async (payload) => {
  return await queueInstance.executeJob(payload);
};

module.exports = {
  LightweightEmailQueue,
  triggerAsyncEmail,
  enqueueEmail,
  triggerSyncEmail
};
