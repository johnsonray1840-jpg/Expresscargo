require('dotenv').config();
const mongoose = require('mongoose');
const { Shipment } = require('../src/models');
const { calculateServerProgress } = require('../src/utils/timeCalculator');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/express-cargo');
  const s = await Shipment.findOne({ status: 'in_transit' }).sort({ createdAt: -1 }).lean();
  if (!s) {
    console.log("No in_transit shipment found");
  } else {
    console.log("Tracking:", s.trackingNumber);
    console.log("trackingSource:", s.trackingSource);
    console.log("startedAt:", s.startedAt);
    console.log("estimatedDeliveryDate:", s.estimatedDeliveryDate);
    const progress = calculateServerProgress(s);
    console.log("Calculated server progress:", progress);
    
    const leanS = await Shipment.findOne({ _id: s._id })
      .select('trackingNumber status statusReason trackingSource emailedMilestones progressPercentage durationHours startedAt expectedDeliveryAt pausedAt resumedAt deliveredAt durationConfig pauseDetails dispatchDate estimatedDeliveryDate actualDeliveryDate serviceType transportMode carrier origin destination currentCoordinates sender recipient payment.status payment.currency isDiplomaticSeal updatedAt createdAt')
      .lean();
    const leanProgress = calculateServerProgress(leanS);
    console.log("Lean progress:", leanProgress);
  }
  process.exit(0);
}
run();
