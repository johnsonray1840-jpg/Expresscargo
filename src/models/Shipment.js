const mongoose = require('mongoose');

const shipmentSchema = new mongoose.Schema(
  {
    trackingNumber: {
      type: String,
      required: [true, 'Tracking number is required'],
      unique: true,
      uppercase: true,
      trim: true
    },
    referenceNumber: {
      type: String,
      trim: true,
      default: ''
    },
    // Core Status Lifecycle
    status: {
      type: String,
      enum: [
        'created',
        'awaiting_pickup',
        'picked_up',
        'processing',
        'in_transit',
        'at_facility',
        'customs_processing',
        'customs_clearance',
        'out_for_delivery',
        'delivery_attempted',
        'delayed',
        'held',
        'paused',
        'suspended',
        'delivered',
        'cancelled',
        'confiscated',
        // Common fallbacks/aliases
        'pending',
        'active',
        'on_hold',
        'customs_hold',
        'returned'
      ],
      default: 'created'
    },
    statusReason: {
      type: String,
      default: '',
      trim: true
    },
    // Progress and Travel Duration
    progressPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    // Server-Side Timestamps & Duration Configuration
    startedAt: {
      type: Date,
      default: Date.now
    },
    expectedDeliveryAt: {
      type: Date
    },
    systemETA: {
      type: Date
    },
    adminETA: {
      type: Date,
      default: null
    },
    etaHistory: [
      {
        previousETA: Date,
        newETA: Date,
        type: { type: String, enum: ['system', 'admin_override', 'pause_adjustment'], default: 'system' },
        reason: String,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    pausedAt: {
      type: Date
    },
    resumedAt: {
      type: Date
    },
    deliveredAt: {
      type: Date
    },
    // Duration Configuration (From 1 hour to infinite)
    durationConfig: {
      preset: {
        type: String,
        enum: ['1h', '2h', '6h', '12h', '1d', '2d', '3d', '1w', '2w', '1m', 'custom', 'indefinite'],
        default: '1d'
      },
      value: { type: Number, default: 24 },
      unit: { type: String, enum: ['hours', 'days', 'weeks', 'months', 'indefinite'], default: 'hours' },
      isIndefinite: { type: Boolean, default: false }
    },
    durationHours: {
      type: Number,
      default: 24,
      min: 0
    },
    dispatchDate: {
      type: Date,
      default: Date.now
    },
    estimatedDeliveryDate: {
      type: Date
    },
    actualDeliveryDate: {
      type: Date
    },
    // Data Tracking Source Flag
    trackingSource: {
      type: String,
      enum: ['gps', 'carrier', 'manual', 'simulation'],
      default: 'manual'
    },
    emailedMilestones: [{ type: Number }],
    // Simulation / Demo Mode Configuration (Admin Only)
    simulationConfig: {
      isSimulated: { type: Boolean, default: false },
      autoProgress: { type: Boolean, default: false },
      simulationSpeed: { type: Number, default: 80 }, // km/h
      speedMultiplier: { type: Number, default: 1 },
      updateIntervalSeconds: { type: Number, default: 10 },
      startTime: { type: Date },
      endTime: { type: Date },
      currentStep: { type: Number, default: 0 },
      totalSteps: { type: Number, default: 100 },
      lastCalculatedAt: { type: Date, default: Date.now },
      currentCheckpointIndex: { type: Number, default: 0 }
    },
    // Pause / Resume Lifecycle History
    pauseDetails: {
      isPaused: { type: Boolean, default: false },
      pausedAt: { type: Date },
      resumedAt: { type: Date },
      pauseReason: { type: String, default: '' },
      previousStatusBeforePause: { type: String, default: 'in_transit' },
      totalPausedDurationMs: { type: Number, default: 0 }
    },
    pauseHistory: [
      {
        pausedAt: { type: Date, required: true },
        resumedAt: { type: Date },
        durationMs: { type: Number, default: 0 },
        reason: { type: String, default: '' },
        pausedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        resumedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
      }
    ],
    // Suspension Details
    suspensionDetails: {
      isSuspended: { type: Boolean, default: false },
      suspendedAt: { type: Date },
      suspensionReason: { type: String, default: '' },
      suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      unsuspendedAt: { type: Date },
      unsuspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    // Confiscation Details (Controlled seizure status - preserves all history)
    confiscationDetails: {
      isConfiscated: { type: Boolean, default: false },
      confiscatedAt: { type: Date },
      confiscationReason: { type: String, default: '' },
      confiscatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      confiscatingAuthority: { type: String, default: 'Border Customs & Regulatory Enforcement' },
      releasedAt: { type: Date },
      releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    // Transport & Service Details
    serviceType: {
      type: String,
      enum: [
        'standard_express',
        'priority_air',
        'ocean_freight',
        'road_cargo',
        'road_transport',
        'express_courier',
        'diplomatic_secure',
        'diplomatic',
        'overnight'
      ],
      default: 'standard_express'
    },
    transportMode: {
      type: String,
      enum: ['Air', 'Ocean', 'Road', 'Rail', 'Diplomatic Courier'],
      default: 'Air'
    },
    carrier: {
      type: String,
      default: 'Express Cargo'
    },
    // Geographic Locations & Real-Time Coordinates
    origin: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      state: String,
      country: { type: String, required: true },
      postalCode: String,
      coordinates: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true }
      }
    },
    destination: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      state: String,
      country: { type: String, required: true },
      postalCode: String,
      coordinates: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true }
      }
    },
    currentCoordinates: {
      lat: { type: Number, default: 0 },
      lng: { type: Number, default: 0 },
      address: { type: String, default: '' },
      city: { type: String, default: '' },
      country: { type: String, default: '' },
      updatedAt: { type: Date, default: Date.now }
    },
    // Sender Information
    sender: {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true },
      phone: { type: String, required: true, trim: true },
      address: String,
      company: String
    },
    // Recipient Information
    recipient: {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true },
      phone: { type: String, required: true, trim: true },
      address: String,
      company: String
    },
    // Payment & Shipping Cost
    payment: {
      status: {
        type: String,
        enum: ['paid', 'pending', 'cash_on_delivery', 'waived'],
        default: 'paid'
      },
      amount: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' },
      paymentMethod: { type: String, default: 'Credit Card / Wire' }
    },
    // Relations & Metadata
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: {
      type: String,
      default: ''
    },
    securityClearanceCode: {
      type: String,
      default: ''
    },
    isDiplomaticSeal: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Indexes
shipmentSchema.index({ status: 1 });
shipmentSchema.index({ 'sender.email': 1 });
shipmentSchema.index({ 'recipient.email': 1 });
shipmentSchema.index({ 'sender.phone': 1 });
shipmentSchema.index({ 'recipient.phone': 1 });
shipmentSchema.index({ customer: 1 });
shipmentSchema.index({ createdAt: -1 });
shipmentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Shipment', shipmentSchema);

