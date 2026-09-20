const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    adminEmail: {
      type: String,
      lowercase: true,
      trim: true
    },
    adminName: {
      type: String,
      trim: true
    },
    action: {
      type: String,
      required: true,
      index: true,
      uppercase: true,
      trim: true
    },
    resource: {
      type: String,
      required: true,
      trim: true
    },
    targetType: {
      type: String,
      trim: true
    },
    resourceId: {
      type: String,
      index: true,
      default: ''
    },
    targetId: {
      type: String,
      index: true,
      default: ''
    },
    previousValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    reason: {
      type: String,
      default: '',
      trim: true
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ipAddress: {
      type: String,
      default: ''
    },
    userAgent: {
      type: String,
      default: ''
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Auto-sync aliases before save
auditLogSchema.pre('save', function (next) {
  if (this.admin && !this.user) this.user = this.admin;
  if (this.user && !this.admin) this.admin = this.user;

  if (this.resource && !this.targetType) this.targetType = this.resource;
  if (this.targetType && !this.resource) this.resource = this.targetType;

  if (this.resourceId && !this.targetId) this.targetId = this.resourceId;
  if (this.targetId && !this.resourceId) this.resourceId = this.targetId;

  if (!this.timestamp) this.timestamp = this.createdAt || new Date();
  next();
});

auditLogSchema.index({ resource: 1, resourceId: 1, timestamp: -1 });
auditLogSchema.index({ admin: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
