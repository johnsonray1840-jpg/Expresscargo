const mongoose = require('mongoose');

const shipmentEventSchema = new mongoose.Schema(
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
    eventType: {
      type: String,
      enum: [
        'CREATED',
        'AWAITING_PICKUP',
        'PICKED_UP',
        'PROCESSING',
        'IN_TRANSIT',
        'AT_FACILITY',
        'CUSTOMS_PROCESSING',
        'CUSTOMS_CLEARANCE',
        'OUT_FOR_DELIVERY',
        'DELIVERY_ATTEMPTED',
        'DELAYED',
        'HELD',
        'PAUSED',
        'RESUMED',
        'SUSPENDED',
        'DELIVERED',
        'CANCELLED',
        'CONFISCATED',
        'LOCATION_UPDATE',
        'CUSTOM'
      ],
      required: true,
      index: true
    },
    previousStatus: {
      type: String,
      default: ''
    },
    newStatus: {
      type: String,
      default: ''
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    locationName: {
      type: String,
      required: true,
      trim: true
    },
    coordinates: {
      lat: Number,
      lng: Number
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    actorRole: {
      type: String,
      enum: ['admin', 'super_admin', 'staff', 'system', 'courier', 'customs_officer'],
      default: 'admin'
    },
    isPublic: {
      type: Boolean,
      default: true
    },
    customerVisible: {
      type: Boolean,
      default: true
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

// Compound index for timeline queries
shipmentEventSchema.index({ shipment: 1, timestamp: -1 });
shipmentEventSchema.index({ trackingNumber: 1, timestamp: -1 });

module.exports = mongoose.model('ShipmentEvent', shipmentEventSchema);
