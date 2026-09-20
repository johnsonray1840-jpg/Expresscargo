const mongoose = require('mongoose');

const deliveryAttemptSchema = new mongoose.Schema(
  {
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment',
      required: true
    },
    trackingNumber: {
      type: String,
      required: true
    },
    attemptNumber: {
      type: Number,
      required: true,
      default: 1
    },
    status: {
      type: String,
      enum: ['failed', 'rescheduled', 'delivered', 'refused'],
      required: true
    },
    reason: {
      type: String,
      default: ''
    },
    notes: {
      type: String,
      default: ''
    },
    recipientSignatureUrl: {
      type: String,
      default: ''
    },
    proofPhotoUrl: {
      type: String,
      default: ''
    },
    receivedBy: {
      type: String,
      default: ''
    },
    attemptedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    attemptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

deliveryAttemptSchema.index({ shipment: 1, attemptNumber: 1 });
deliveryAttemptSchema.index({ trackingNumber: 1, attemptedAt: -1 });

module.exports = mongoose.model('DeliveryAttempt', deliveryAttemptSchema);

