const { Shipment } = require('../models');
const { calculateServerProgress } = require('./timeCalculator');
const { triggerAsyncEmail } = require('../services/emailDispatcher');
const { renderMilestoneEmailHtml } = require('../emails/templates');
const logger = require('./logger');

const MILESTONES = [0, 10, 20, 30, 50, 70, 90, 100];

const evaluateMilestones = async () => {
  try {
    const activeShipments = await Shipment.find({
      status: { $in: ['in_transit', 'active'] }
    });

    for (const shipment of activeShipments) {
      const progress = calculateServerProgress(shipment);
      const emailed = shipment.emailedMilestones || [];
      
      for (const target of MILESTONES) {
        if (progress >= target && !emailed.includes(target)) {
          logger.info(`Automated workflow: Shipment ${shipment.trackingNumber} hit ${target}% completion. Sending emails.`);
          
          const title = `Automated Milestone Checkpoint: ${target}% Complete`;
          const desc = `Your consignment has reached ${target}% of its journey and is securely en route.`;
          
          const html = renderMilestoneEmailHtml({
            shipment, 
            milestoneTitle: title, 
            milestoneMessage: desc,
            progressPercentage: progress
          });
          
          const emails = [];
          if (shipment.sender?.email) emails.push(shipment.sender.email);
          if (shipment.recipient?.email) emails.push(shipment.recipient.email);
          
          if (emails.length > 0) {
            triggerAsyncEmail({
              to: emails,
              subject: `Update on Shipment ${shipment.trackingNumber} - ${target}% Complete`,
              html: html,
              template: 'status_update',
              shipmentId: shipment._id,
              trackingNumber: shipment.trackingNumber
            });
          }
          
          emailed.push(target);
          shipment.emailedMilestones = emailed;
          await shipment.save();
        }
      }
    }
  } catch (error) {
    logger.error('Error running automated milestone cron job:', error);
  }
};

const initCronJobs = () => {
  // Run every 1 minute
  setInterval(evaluateMilestones, 60000);
  logger.info('Automated milestone background cron workflow activated.');
};

module.exports = { initCronJobs };

