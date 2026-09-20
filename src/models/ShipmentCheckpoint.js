const mongoose = require('mongoose');

const shipmentCheckpointSchema = new mongoose.Schema(
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
    sequenceOrder: {
      type: Number,
      required: true
    },
    checkpointName: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      type: String,
      trim: true,
      default: ''
    },
    city: {
      type: String,
      required: true,
      trim: true
    },
    country: {
      type: String,
      required: true,
      trim: true
    },
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true }
    },
    status: {
      type: String,
      enum: ['pending', 'in_transit', 'reached', 'departed', 'skipped'],
      default: 'pending'
    },
    estimatedArrival: {
      type: Date
    },
    actualArrival: {
      type: Date
    },
    estimatedDeparture: {
      type: Date
    },
    actualDeparture: {
      type: Date
    },
    notes: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

shipmentCheckpointSchema.index({ shipment: 1, sequenceOrder: 1 });
shipmentCheckpointSchema.index({ trackingNumber: 1, sequenceOrder: 1 });

module.exports = mongoose.model('ShipmentCheckpoint', shipmentCheckpointSchema);
