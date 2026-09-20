const mongoose = require('mongoose');

const shipmentLocationSchema = new mongoose.Schema(
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
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true }
    },
    address: {
      type: String,
      default: ''
    },
    city: {
      type: String,
      default: ''
    },
    country: {
      type: String,
      default: ''
    },
    speed: {
      type: Number, // km/h or knots
      default: 0
    },
    heading: {
      type: Number, // degrees (0-360)
      default: 0
    },
    altitude: {
      type: Number, // meters
      default: 0
    },
    source: {
      type: String,
      enum: ['gps', 'carrier', 'manual', 'simulation'],
      default: 'manual'
    },
    batteryLevel: {
      type: Number, // percentage for GPS beacons
      default: 100
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

shipmentLocationSchema.index({ shipment: 1, timestamp: -1 });
shipmentLocationSchema.index({ trackingNumber: 1, timestamp: -1 });

module.exports = mongoose.model('ShipmentLocation', shipmentLocationSchema);

