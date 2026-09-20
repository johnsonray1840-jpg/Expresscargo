const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema(
  {
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment',
      default: null
    },
    trackingNumber: {
      type: String,
      uppercase: true,
      trim: true,
      default: ''
    },
    recipient: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    recipientEmail: {
      type: String,
      lowercase: true,
      trim: true
    },
    subject: {
      type: String,
      required: true
    },
    event: {
      type: String,
      default: 'GENERAL_NOTIFICATION'
    },
    template: {
      type: String,
      default: 'status_update'
    },
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed'],
      default: 'queued'
    },
    error: {
      type: String,
      default: ''
    },
    errorMessage: {
      type: String,
      default: ''
    },
    messageId: {
      type: String,
      default: ''
    },
    attempts: {
      type: Number,
      default: 0
    },
    sentAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Auto-sync recipient / recipientEmail and error / errorMessage
emailLogSchema.pre('save', function (next) {
  if (this.recipient && !this.recipientEmail) {
    this.recipientEmail = this.recipient;
  } else if (this.recipientEmail && !this.recipient) {
    this.recipient = this.recipientEmail;
  }

  if (this.error && !this.errorMessage) {
    this.errorMessage = this.error;
  } else if (this.errorMessage && !this.error) {
    this.error = this.errorMessage;
  }
  next();
});

emailLogSchema.index({ shipment: 1, createdAt: -1 });
emailLogSchema.index({ recipient: 1, sentAt: -1 });
emailLogSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('EmailLog', emailLogSchema);
