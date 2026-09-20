const mongoose = require('mongoose');

const shipmentDocumentSchema = new mongoose.Schema(
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
    title: {
      type: String,
      required: true,
      trim: true
    },
    documentType: {
      type: String,
      enum: ['air_waybill', 'bill_of_lading', 'commercial_invoice', 'customs_clearance', 'diplomatic_permit', 'proof_of_delivery', 'insurance_certificate', 'other'],
      default: 'air_waybill'
    },
    fileUrl: {
      type: String,
      required: true
    },
    publicId: {
      type: String,
      default: ''
    },
    fileSize: {
      type: Number,
      default: 0
    },
    mimeType: {
      type: String,
      default: 'application/pdf'
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    isPublic: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

shipmentDocumentSchema.index({ shipment: 1, documentType: 1 });
shipmentDocumentSchema.index({ trackingNumber: 1 });

module.exports = mongoose.model('ShipmentDocument', shipmentDocumentSchema);

