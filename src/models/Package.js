const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema(
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
    description: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      enum: ['documents', 'electronics', 'apparel', 'diplomatic_pouch', 'medical', 'fragile', 'heavy_machinery', 'general_cargo'],
      default: 'general_cargo'
    },
    weight: {
      value: { type: Number, required: true, min: 0 },
      unit: { type: String, enum: ['kg', 'lbs'], default: 'kg' }
    },
    dimensions: {
      length: { type: Number, default: 0 },
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
      unit: { type: String, enum: ['cm', 'inch'], default: 'cm' }
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1
    },
    declaredValue: {
      amount: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' }
    },
    isFragile: {
      type: Boolean,
      default: false
    },
    isPerishable: {
      type: Boolean,
      default: false
    },
    barcodeUrl: {
      type: String,
      default: ''
    },
    qrCodeUrl: {
      type: String,
      default: ''
    },
    packageImages: [
      {
        url: String,
        publicId: String,
        caption: String
      }
    ]
  },
  {
    timestamps: true
  }
);

packageSchema.index({ shipment: 1 });
packageSchema.index({ trackingNumber: 1 });
packageSchema.index({ category: 1 });

module.exports = mongoose.model('Package', packageSchema);

