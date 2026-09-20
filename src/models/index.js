const User = require('./User');
const Shipment = require('./Shipment');
const Package = require('./Package');
const ShipmentEvent = require('./ShipmentEvent');
const ShipmentLocation = require('./ShipmentLocation');
const ShipmentCheckpoint = require('./ShipmentCheckpoint');
const Notification = require('./Notification');
const EmailLog = require('./EmailLog');
const AuditLog = require('./AuditLog');
const SystemSetting = require('./SystemSetting');
const ShipmentAssignment = require('./ShipmentAssignment');
const ShipmentDocument = require('./ShipmentDocument');
const DeliveryAttempt = require('./DeliveryAttempt');

module.exports = {
  User,
  Shipment,
  Package,
  ShipmentEvent,
  ShipmentLocation,
  ShipmentCheckpoint,
  Notification,
  EmailLog,
  AuditLog,
  SystemSetting,
  ShipmentAssignment,
  ShipmentDocument,
  DeliveryAttempt
};

