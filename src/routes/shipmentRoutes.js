const express = require('express');
const router = express.Router();
const {
  createShipment,
  getAllShipments,
  getShipmentById,
  updateShipment,
  deleteShipment,
  assignCustomer,
  assignStaff,
  cancelShipment,
  markDelivered,
  addPublicNote,
  addInternalNote,
  uploadShipmentDocument,
  getShipmentDocuments,
  deleteShipmentDocument,
  startAutoSimulation
} = require('../controllers/shipmentController');
const {
  updateShipmentStatus,
  getShipmentEvents,
  addCustomShipmentEvent
} = require('../controllers/shipmentStatusController');
const {
  updateShipmentLocation,
  getShipmentLocationHistory
} = require('../controllers/shipmentLocationController');
const {
  configureSimulation,
  advanceSimulationStep,
  resetSimulation
} = require('../controllers/simulationController');
const {
  addCheckpoints,
  getShipmentCheckpoints,
  updateCheckpoint,
  deleteCheckpoint,
  reorderCheckpoints
} = require('../controllers/checkpointController');
const {
  pauseShipment,
  resumeShipment
} = require('../controllers/pauseController');
const {
  suspendShipment,
  unsuspendShipment
} = require('../controllers/suspensionController');
const {
  confiscateShipment,
  unconfiscateShipment
} = require('../controllers/confiscationController');
const {
  updateShipmentDuration
} = require('../controllers/durationController');
const {
  updateAdminETA,
  clearAdminETAOverride,
  getETABreakdown
} = require('../controllers/etaController');
const { protect, authorize } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');

// All shipment management routes require authentication and staff/admin permissions
router.use(protect);
router.use(authorize('admin', 'super_admin', 'staff'));

// Core Shipment CRUD & Lifecycle
router.route('/')
  .post(createShipment)
  .get(getAllShipments);

router.route('/:id')
  .get(getShipmentById)
  .put(updateShipment)
  .delete(deleteShipment);

// Assignments
router.patch('/:id/assign-customer', assignCustomer);
router.patch('/:id/assign-staff', assignStaff);

// Operational Actions (Cancel, Deliver)
router.post('/:id/cancel', cancelShipment);
router.post('/:id/deliver', markDelivered);

// Notes (Customer-visible and Internal)
router.post('/:id/notes/public', addPublicNote);
router.post('/:id/notes/internal', addInternalNote);

// Documents Management
router.route('/:id/documents')
  .post(upload.single('document'), uploadShipmentDocument)
  .get(getShipmentDocuments);

router.delete('/:id/documents/:docId', deleteShipmentDocument);

// Controlled status management & timeline audit trails
router.patch('/:id/status', updateShipmentStatus);
router.get('/:id/events', getShipmentEvents);
router.post('/:id/events', addCustomShipmentEvent);

// Schedule and Duration Configuration (1 hour to infinite)
router.patch('/:id/duration', updateShipmentDuration);

// ETA Management & Admin Override (Preserves previous values in event history)
router.patch('/:id/eta', updateAdminETA);
router.get('/:id/eta', getETABreakdown);
router.delete('/:id/eta/override', clearAdminETAOverride);

// Pause and Resume operations
router.post('/:id/pause', pauseShipment);
router.post('/:id/resume', resumeShipment);

// Suspension operations
router.post('/:id/suspend', suspendShipment);
router.post('/:id/unsuspend', unsuspendShipment);

// Confiscation operations (Preserves all historical records)
router.post('/:id/confiscate', confiscateShipment);
router.post('/:id/unconfiscate', unconfiscateShipment);

// Real-time GPS location updates & breadcrumb history
router.patch('/:id/location', updateShipmentLocation);
router.get('/:id/locations', getShipmentLocationHistory);

// Route Checkpoints & Waypoint Management
router.post('/:id/checkpoints', addCheckpoints);
router.get('/:id/checkpoints', getShipmentCheckpoints);
router.put('/:id/checkpoints/reorder', reorderCheckpoints);
router.put('/:id/checkpoints/:checkpointId', updateCheckpoint);
router.delete('/:id/checkpoints/:checkpointId', deleteCheckpoint);

// Admin-Only Simulation & Demo Mode
router.post('/:id/start-auto-simulation', startAutoSimulation);
router.post('/:id/simulation/config', configureSimulation);
router.post('/:id/simulation/step', advanceSimulationStep);
router.post('/:id/simulation/reset', resetSimulation);

module.exports = router;
