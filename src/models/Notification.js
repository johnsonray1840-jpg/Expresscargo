const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment',
      index: true,
      default: null
    },
    trackingNumber: {
      type: String,
      uppercase: true,
      trim: true,
      index: true,
      default: ''
    },
    type: {
      type: String,
      enum: ['STATUS_CHANGE', 'DELAY_ALERT', 'CUSTOMS_HOLD', 'SUSPENSION', 'CONFISCATION', 'DELIVERY_SUCCESS', 'SYSTEM', 'INFO', 'WARNING'],
      default: 'STATUS_CHANGE'
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    read: {
      type: Boolean,
      default: false,
      index: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// Auto-sync user and recipient fields
notificationSchema.pre('save', function (next) {
  if (this.user && !this.recipient) {
    this.recipient = this.user;
  } else if (this.recipient && !this.user) {
    this.user = this.recipient;
  }
  next();
});

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
