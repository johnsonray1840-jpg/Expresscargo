const mongoose = require('mongoose');

const shipmentAssignmentSchema = new mongoose.Schema(
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
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['driver', 'courier', 'customs_officer', 'hub_manager', 'diplomatic_escort'],
      default: 'courier'
    },
    status: {
      type: String,
      enum: ['assigned', 'accepted', 'in_progress', 'completed', 'reassigned'],
      default: 'assigned'
    },
    notes: {
      type: String,
      default: ''
    },
    assignedAt: {
      type: Date,
      default: Date.now
    },
    completedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

shipmentAssignmentSchema.index({ shipment: 1, status: 1 });
shipmentAssignmentSchema.index({ assignedTo: 1, status: 1 });

module.exports = mongoose.model('ShipmentAssignment', shipmentAssignmentSchema);

