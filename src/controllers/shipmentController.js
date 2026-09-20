const {
  Shipment,
  Package,
  ShipmentCheckpoint,
  ShipmentEvent,
  ShipmentLocation,
  ShipmentAssignment,
  ShipmentDocument,
  DeliveryAttempt,
  AuditLog,
  User
} = require('../models');
const { generateUniqueTrackingNumber } = require('../utils/trackingGenerator');
const { createShipmentSchema } = require('../validations/shipmentValidation');
const { sendShipmentStatusAlert } = require('../services/emailService');
const { notifyShipmentStakeholders, createCustomerNotification } = require('../services/notificationService');
const { broadcastShipmentUpdate } = require('../config/socket');
const { invalidateDashboardCache } = require('./adminDashboardController');
const { deleteFromCloudinary } = require('../config/cloudinary');
const { resolveCityCoordinates } = require('../utils/cityCoordinates');
const { resolveLocationCoordinatesAsync, resolveLocationCoordinatesSync } = require('../utils/geocoder');
const logger = require('../utils/logger');

/**
 * @desc Create a new shipment (Admin/Staff only)
 * @route POST /api/shipments
 */
const createShipment = async (req, res, next) => {
  try {
    const validatedData = createShipmentSchema.parse(req.body);

    // Auto-resolve high-accuracy coordinates (checks full address/city/country string)
    if (!validatedData.origin.coordinates || validatedData.origin.coordinates.lat == null) {
      const originQuery = `${validatedData.origin.address || ''} ${validatedData.origin.city || ''} ${validatedData.origin.country || ''}`.trim();
      validatedData.origin.coordinates = await resolveLocationCoordinatesAsync(originQuery, { lat: 51.5074, lng: -0.1278 });
    }
    if (!validatedData.destination.coordinates || validatedData.destination.coordinates.lat == null) {
      const destQuery = `${validatedData.destination.address || ''} ${validatedData.destination.city || ''} ${validatedData.destination.country || ''}`.trim();
      validatedData.destination.coordinates = await resolveLocationCoordinatesAsync(destQuery, { lat: 40.7128, lng: -74.0060 });
    }

    // 1. Generate or validate secure unique tracking number
    let trackingNumber = validatedData.trackingNumber;
    if (!trackingNumber) {
      const destCountry = validatedData.destination.country ? validatedData.destination.country.slice(0, 2) : 'US';
      trackingNumber = await generateUniqueTrackingNumber(destCountry);
    } else {
      trackingNumber = trackingNumber.trim().toUpperCase();
      const exists = await Shipment.findOne({ trackingNumber });
      if (exists) {
        return res.status(400).json({
          success: false,
          error: `Tracking number '${trackingNumber}' is already in use. Please choose another or let the system auto-generate.`
        });
      }
    }

    // 2. Compute Dates & ETA based on durationHours
    const dispatchDate = validatedData.dispatchDate ? new Date(validatedData.dispatchDate) : new Date();
    const durationHours = validatedData.durationHours || 24;
    const estimatedDeliveryDate = validatedData.estimatedDeliveryDate
      ? new Date(validatedData.estimatedDeliveryDate)
      : new Date(dispatchDate.getTime() + durationHours * 60 * 60 * 1000);

    // 3. Resolve Customer ID if provided as email or ObjectId
    let customerId = validatedData.assignedCustomer || null;
    if (customerId && typeof customerId === 'string' && customerId.includes('@')) {
      const user = await User.findOne({ email: customerId.toLowerCase() }).select('_id');
      if (user) customerId = user._id;
      else customerId = null;
    }

    // 4. Create Shipment Document
    const shipment = new Shipment({
      trackingNumber,
      referenceNumber: validatedData.referenceNumber || '',
      sender: validatedData.sender,
      recipient: validatedData.recipient,
      origin: validatedData.origin,
      destination: validatedData.destination,
      currentCoordinates: {
        lat: validatedData.origin.coordinates.lat,
        lng: validatedData.origin.coordinates.lng,
        address: validatedData.origin.address,
        city: validatedData.origin.city,
        country: validatedData.origin.country,
        updatedAt: new Date()
      },
      serviceType: validatedData.serviceType,
      transportMode: validatedData.transportMode,
      carrier: validatedData.carrier,
      status: validatedData.status || 'created',
      statusReason: validatedData.statusReason || 'Shipment created and ready for dispatch',
      durationHours,
      dispatchDate,
      startedAt: dispatchDate,
      estimatedDeliveryDate,
      expectedDeliveryAt: estimatedDeliveryDate,
      systemETA: estimatedDeliveryDate,
      customer: customerId,
      assignedStaff: validatedData.assignedStaff || null,
      createdBy: req.user._id,
      notes: validatedData.notes || '',
      isDiplomaticSeal: validatedData.isDiplomaticSeal || false
    });

    await shipment.save();
    invalidateDashboardCache();

    // 5. Create Package Specification if provided
    let packageRecord = null;
    if (validatedData.package) {
      packageRecord = await Package.create({
        shipment: shipment._id,
        trackingNumber: shipment.trackingNumber,
        description: validatedData.package.description,
        category: validatedData.package.category || 'general_cargo',
        weight: validatedData.package.weight,
        dimensions: validatedData.package.dimensions || { length: 0, width: 0, height: 0, unit: 'cm' },
        quantity: validatedData.package.quantity || 1,
        declaredValue: validatedData.package.declaredValue || { amount: 0, currency: 'USD' },
        isFragile: validatedData.package.isFragile || false,
        isPerishable: validatedData.package.isPerishable || false,
        barcodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shipment.trackingNumber)}`,
        qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shipment.trackingNumber)}`
      });
    }

    // 6. Create Route Checkpoints if provided
    if (validatedData.checkpoints && validatedData.checkpoints.length > 0) {
      const checkpointDocs = validatedData.checkpoints.map((cp, idx) => ({
        shipment: shipment._id,
        trackingNumber: shipment.trackingNumber,
        sequenceOrder: idx + 1,
        checkpointName: cp.checkpointName,
        city: cp.city,
        country: cp.country,
        coordinates: cp.coordinates,
        status: idx === 0 ? 'in_transit' : 'pending',
        estimatedArrival: cp.estimatedArrival ? new Date(cp.estimatedArrival) : undefined,
        notes: cp.notes || ''
      }));
      await ShipmentCheckpoint.insertMany(checkpointDocs);
    }

    // 7. Create Initial Timeline Event
    await ShipmentEvent.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      eventType: 'CREATED',
      title: 'Shipment Registered & Waybill Generated',
      description: `Shipment order created from ${shipment.origin.city}, ${shipment.origin.country} to ${shipment.destination.city}, ${shipment.destination.country}. Expected Delivery: ${estimatedDeliveryDate.toDateString()}`,
      locationName: `${shipment.origin.city}, ${shipment.origin.country}`,
      coordinates: shipment.origin.coordinates,
      actor: req.user._id,
      actorRole: req.user.role,
      isPublic: true,
      customerVisible: true
    });

    // 8. Create Initial Location Breadcrumb
    await ShipmentLocation.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      coordinates: shipment.origin.coordinates,
      address: shipment.origin.address,
      city: shipment.origin.city,
      country: shipment.origin.country,
      speed: 0,
      timestamp: new Date()
    });

    // 9. Assign staff/courier if requested
    if (validatedData.assignedStaff) {
      await ShipmentAssignment.create({
        shipment: shipment._id,
        trackingNumber: shipment.trackingNumber,
        assignedTo: validatedData.assignedStaff,
        assignedBy: req.user._id,
        status: 'assigned',
        notes: 'Initial assignment upon shipment creation'
      }).catch((err) => logger.warn('Failed to record shipment assignment:', err.message));
    }

    // 10. Audit Log
    AuditLog.create({
      user: req.user._id,
      actor: req.user._id,
      actorRole: req.user.role,
      userEmail: req.user.email,
      action: 'SHIPMENT_CREATED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: {
        trackingNumber: shipment.trackingNumber,
        origin: shipment.origin.city,
        destination: shipment.destination.city,
        status: shipment.status
      }
    }).catch(() => {});

    // 11. Send Email Notification & In-App Notification
    sendShipmentStatusAlert(
      shipment,
      'Your Shipment Has Been Registered & Dispatched',
      `Your parcel is booked with Express Cargo. Track your delivery online with tracking number ${shipment.trackingNumber}.`,
      '#0284c7'
    );

    notifyShipmentStakeholders(
      shipment,
      'Shipment Registered',
      `Your shipment ${shipment.trackingNumber} has been booked and registered for transit.`,
      'STATUS_CHANGE'
    ).catch(() => {});

    // 12. Socket.IO Broadcast
    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:created', {
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      origin: shipment.origin,
      destination: shipment.destination,
      currentLocation: shipment.currentCoordinates
    });

    res.status(201).json({
      success: true,
      message: 'Shipment successfully created.',
      data: {
        shipment,
        package: packageRecord
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get all shipments with advanced search, filtering, date range, and strictly clamped pagination (Admin/Staff)
 * @route GET /api/shipments
 */
const getAllShipments = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    // Strict safety cap: Default 20, max 50 records per page to prevent shared hosting memory spikes
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 50);
    const skip = (page - 1) * limit;

    const filter = {};

    // 1. Direct or Partial Tracking Number Filter
    if (req.query.trackingNumber || req.query.tracking) {
      const trackQuery = (req.query.trackingNumber || req.query.tracking).trim();
      filter.trackingNumber = { $regex: trackQuery, $options: 'i' };
    }

    // 2. Controlled Status Filter (supports single status or comma-separated list)
    if (req.query.status) {
      const statuses = req.query.status.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (statuses.length === 1) {
        filter.status = statuses[0];
      } else if (statuses.length > 1) {
        filter.status = { $in: statuses };
      }
    }

    // 3. Sender Filter (Name, Email, Phone)
    if (req.query.sender) {
      const senderRegex = new RegExp(req.query.sender.trim(), 'i');
      filter.$or = filter.$or || [];
      filter.$or.push(
        { 'sender.name': senderRegex },
        { 'sender.email': senderRegex },
        { 'sender.phone': senderRegex },
        { 'sender.company': senderRegex }
      );
    }
    if (req.query.senderName) {
      filter['sender.name'] = { $regex: req.query.senderName.trim(), $options: 'i' };
    }
    if (req.query.senderEmail) {
      filter['sender.email'] = { $regex: req.query.senderEmail.trim(), $options: 'i' };
    }

    // 4. Recipient Filter (Name, Email, Phone)
    if (req.query.recipient) {
      const recipientRegex = new RegExp(req.query.recipient.trim(), 'i');
      filter.$or = filter.$or || [];
      filter.$or.push(
        { 'recipient.name': recipientRegex },
        { 'recipient.email': recipientRegex },
        { 'recipient.phone': recipientRegex },
        { 'recipient.company': recipientRegex }
      );
    }
    if (req.query.recipientName) {
      filter['recipient.name'] = { $regex: req.query.recipientName.trim(), $options: 'i' };
    }
    if (req.query.recipientEmail) {
      filter['recipient.email'] = { $regex: req.query.recipientEmail.trim(), $options: 'i' };
    }

    // 5. Customer Account Filter (ObjectId or search by customer name/email)
    if (req.query.customer || req.query.customerId) {
      const custQuery = (req.query.customer || req.query.customerId).trim();
      if (custQuery.match(/^[0-9a-fA-F]{24}$/)) {
        filter.customer = custQuery;
      } else {
        const matchingUsers = await User.find({
          $or: [
            { name: { $regex: custQuery, $options: 'i' } },
            { email: { $regex: custQuery, $options: 'i' } }
          ]
        }).select('_id').lean();
        const userIds = matchingUsers.map((u) => u._id);
        filter.$or = filter.$or || [];
        filter.$or.push(
          { customer: { $in: userIds } },
          { 'sender.email': { $regex: custQuery, $options: 'i' } },
          { 'recipient.email': { $regex: custQuery, $options: 'i' } }
        );
      }
    }

    // 6. Origin Location Filter
    if (req.query.origin) {
      const originRegex = new RegExp(req.query.origin.trim(), 'i');
      filter.$or = filter.$or || [];
      filter.$or.push(
        { 'origin.city': originRegex },
        { 'origin.country': originRegex },
        { 'origin.address': originRegex }
      );
    }
    if (req.query.originCity) {
      filter['origin.city'] = { $regex: req.query.originCity.trim(), $options: 'i' };
    }
    if (req.query.originCountry) {
      filter['origin.country'] = { $regex: req.query.originCountry.trim(), $options: 'i' };
    }

    // 7. Destination Location Filter
    if (req.query.destination) {
      const destRegex = new RegExp(req.query.destination.trim(), 'i');
      filter.$or = filter.$or || [];
      filter.$or.push(
        { 'destination.city': destRegex },
        { 'destination.country': destRegex },
        { 'destination.address': destRegex }
      );
    }
    if (req.query.destinationCity) {
      filter['destination.city'] = { $regex: req.query.destinationCity.trim(), $options: 'i' };
    }
    if (req.query.destinationCountry) {
      filter['destination.country'] = { $regex: req.query.destinationCountry.trim(), $options: 'i' };
    }

    // 8. Carrier & Service Type Filter
    if (req.query.carrier) filter.carrier = req.query.carrier;
    if (req.query.serviceType) filter.serviceType = req.query.serviceType;
    if (req.query.transportMode) filter.transportMode = req.query.transportMode;

    // 9. Date Range Filtering
    if (req.query.startDate || req.query.endDate) {
      const dateField = ['createdAt', 'dispatchDate', 'startedAt', 'expectedDeliveryAt', 'deliveredAt'].includes(req.query.dateField)
        ? req.query.dateField
        : 'createdAt';

      filter[dateField] = {};
      if (req.query.startDate) {
        const start = new Date(req.query.startDate);
        if (!isNaN(start.getTime())) filter[dateField].$gte = start;
      }
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        if (!isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          filter[dateField].$lte = end;
        }
      }
    }

    // 10. Global Search Query across multiple columns
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search.trim(), 'i');
      filter.$or = filter.$or || [];
      filter.$or.push(
        { trackingNumber: searchRegex },
        { referenceNumber: searchRegex },
        { 'sender.name': searchRegex },
        { 'recipient.name': searchRegex },
        { 'sender.email': searchRegex },
        { 'recipient.email': searchRegex },
        { 'origin.city': searchRegex },
        { 'origin.country': searchRegex },
        { 'destination.city': searchRegex },
        { 'destination.country': searchRegex }
      );
    }

    // 11. Sorting Configuration
    const allowedSortFields = ['createdAt', 'updatedAt', 'dispatchDate', 'expectedDeliveryAt', 'status', 'progressPercentage', 'trackingNumber'];
    const sortBy = allowedSortFields.includes(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const sortOption = { [sortBy]: sortOrder };

    const [shipments, total] = await Promise.all([
      Shipment.find(filter)
        .populate('customer', 'name email phone')
        .populate('assignedStaff', 'name email phone role')
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),
      Shipment.countDocuments(filter)
    ]);

    const { calculateServerProgress } = require('../utils/timeCalculator');

    const mappedShipments = shipments.map(s => {
      const liveProg = calculateServerProgress(s);
      return {
        ...s,
        progressPercentage: liveProg !== null && liveProg !== undefined ? liveProg : (s.progressPercentage || 0)
      };
    });

    return res.status(200).json({
      success: true,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
      count: mappedShipments.length,
      sortBy,
      sortOrder: sortOrder === 1 ? 'asc' : 'desc',
      data: mappedShipments
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get complete shipment details for admin
 * @route GET /api/shipments/:id
 */
const getShipmentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    })
      .populate('customer', 'name email phone address')
      .populate('assignedStaff', 'name email phone role')
      .populate('createdBy', 'name email')
      .lean();

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Shipment not found'
      });
    }

    const [packages, checkpoints, events, assignments, documents, attempts] = await Promise.all([
      Package.find({ shipment: shipment._id }).lean(),
      ShipmentCheckpoint.find({ shipment: shipment._id }).sort({ sequenceOrder: 1 }).lean(),
      ShipmentEvent.find({ shipment: shipment._id }).populate('actor', 'name email role').sort({ timestamp: -1 }).lean(),
      ShipmentAssignment.find({ shipment: shipment._id }).populate('assignedTo', 'name email phone').lean(),
      ShipmentDocument.find({ shipment: shipment._id }).populate('uploadedBy', 'name email').lean(),
      DeliveryAttempt.find({ shipment: shipment._id }).sort({ attemptNumber: -1 }).lean()
    ]);

    res.status(200).json({
      success: true,
      data: {
        ...shipment,
        packages,
        checkpoints,
        events,
        assignments,
        documents,
        attempts
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Edit / Update Full Shipment Details (Full Admin CRUD)
 * @route PUT /api/shipments/:id
 */
const updateShipment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    const previousStatus = shipment.status;
    const updatableFields = [
      'referenceNumber',
      'serviceType',
      'transportMode',
      'carrier',
      'status',
      'statusReason',
      'progressPercentage',
      'durationHours',
      'dispatchDate',
      'startedAt',
      'estimatedDeliveryDate',
      'expectedDeliveryAt',
      'adminETA',
      'notes',
      'isDiplomaticSeal',
      'securityClearanceCode'
    ];

    const changes = {};
    updatableFields.forEach((f) => {
      if (req.body[f] !== undefined) {
        changes[f] = { before: shipment[f], after: req.body[f] };
        shipment[f] = req.body[f];
      }
    });

    // Update Sender Details
    if (req.body.sender) {
      shipment.sender = { ...(shipment.sender ? shipment.sender.toObject() : {}), ...req.body.sender };
    }

    // Update Recipient Details
    if (req.body.recipient) {
      shipment.recipient = { ...(shipment.recipient ? shipment.recipient.toObject() : {}), ...req.body.recipient };
    }

    // Update Origin & Auto-resolve Coordinates
    if (req.body.origin) {
      const orig = { ...(shipment.origin ? shipment.origin.toObject() : {}), ...req.body.origin };
      if (!orig.coordinates || orig.coordinates.lat == null || req.body.origin.city || req.body.origin.country || req.body.origin.address) {
        const originQuery = `${orig.address || ''} ${orig.city || ''} ${orig.country || ''}`.trim();
        orig.coordinates = await resolveLocationCoordinatesAsync(originQuery, { lat: 51.5074, lng: -0.1278 });
      }
      shipment.origin = orig;
    }

    // Update Destination & Auto-resolve Coordinates
    if (req.body.destination) {
      const dest = { ...(shipment.destination ? shipment.destination.toObject() : {}), ...req.body.destination };
      if (!dest.coordinates || dest.coordinates.lat == null || req.body.destination.city || req.body.destination.country || req.body.destination.address) {
        const destQuery = `${dest.address || ''} ${dest.city || ''} ${dest.country || ''}`.trim();
        dest.coordinates = await resolveLocationCoordinatesAsync(destQuery, { lat: 40.7128, lng: -74.0060 });
      }
      shipment.destination = dest;
    }

    // Update Payment Details
    if (req.body.payment) {
      shipment.payment = { ...(shipment.payment ? shipment.payment.toObject() : {}), ...req.body.payment };
    }

    // Recalculate ETA if durationHours or dispatchDate updated
    if (req.body.durationHours || req.body.dispatchDate) {
      const dDate = new Date(shipment.dispatchDate || shipment.startedAt || shipment.createdAt || Date.now());
      const dHours = Number(shipment.durationHours) || 24;
      if (!req.body.estimatedDeliveryDate && !req.body.expectedDeliveryAt) {
        const computedETA = new Date(dDate.getTime() + dHours * 60 * 60 * 1000);
        shipment.estimatedDeliveryDate = computedETA;
        shipment.expectedDeliveryAt = computedETA;
        shipment.systemETA = computedETA;
      }
    }

    await shipment.save();

    // Update Package Record if package details supplied
    if (req.body.packages && Array.isArray(req.body.packages) && req.body.packages.length > 0) {
      const pkg0 = req.body.packages[0];
      await Package.findOneAndUpdate(
        { shipment: shipment._id },
        {
          description: pkg0.description || 'General Cargo',
          weight: typeof pkg0.weight === 'object' ? pkg0.weight : { value: Number(pkg0.weight) || 12.5, unit: pkg0.weightUnit || 'kg' },
          declaredValue: pkg0.declaredValue || { amount: 1000, currency: 'USD' }
        },
        { upsert: true }
      );
    } else if (req.body.weight) {
      await Package.findOneAndUpdate(
        { shipment: shipment._id },
        {
          weight: { value: Number(req.body.weight) || 12.5, unit: req.body.weightUnit || 'kg' },
          description: req.body.packageDescription || 'General Cargo'
        },
        { upsert: true }
      );
    }

    // If status changed, automatically send dual-party milestone email alert
    if (req.body.status && req.body.status !== previousStatus) {
      sendShipmentStatusAlert(
        shipment,
        `Status Updated: ${(shipment.status || '').toUpperCase().replace(/_/g, ' ')}`,
        shipment.statusReason || `Your consignment status has been updated to ${shipment.status}.`
      );
    }

    // Audit Log
    AuditLog.create({
      user: req.user._id,
      actor: req.user._id,
      actorRole: req.user.role,
      action: 'SHIPMENT_EDITED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: changes
    }).catch(() => {});

    // Invalidate dashboard metrics cache
    invalidateDashboardCache();

    // Broadcast live WebSocket event
    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:updated', {
      trackingNumber: shipment.trackingNumber,
      shipment
    });

    res.status(200).json({
      success: true,
      message: 'Shipment details successfully updated',
      data: shipment
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Delete Shipment & Cascading Child Entities (Full Admin CRUD)
 * @route DELETE /api/shipments/:id
 * @access Private/Admin
 */
const deleteShipment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    const trackingNumber = shipment.trackingNumber;

    // Delete cascading resources
    await Promise.all([
      Package.deleteMany({ shipment: shipment._id }),
      ShipmentCheckpoint.deleteMany({ shipment: shipment._id }),
      ShipmentEvent.deleteMany({ shipment: shipment._id }),
      ShipmentLocation.deleteMany({ shipment: shipment._id }),
      ShipmentAssignment.deleteMany({ shipment: shipment._id }),
      ShipmentDocument.deleteMany({ shipment: shipment._id }),
      DeliveryAttempt.deleteMany({ shipment: shipment._id })
    ]);

    // Delete the shipment itself
    await Shipment.findByIdAndDelete(shipment._id);

    // Audit Log
    AuditLog.create({
      user: req.user._id,
      actor: req.user._id,
      actorRole: req.user.role,
      action: 'SHIPMENT_DELETED',
      targetType: 'Shipment',
      targetId: trackingNumber,
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: {
        trackingNumber,
        sender: shipment.sender,
        recipient: shipment.recipient
      }
    }).catch(() => {});

    // Invalidate dashboard metrics cache
    invalidateDashboardCache();

    // Broadcast live WebSocket event
    broadcastShipmentUpdate(trackingNumber, 'shipment:deleted', { trackingNumber });

    return res.status(200).json({
      success: true,
      message: `Consignment ${trackingNumber} and all associated records have been permanently deleted.`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Assign Customer to Shipment
 * @route PATCH /api/shipments/:id/assign-customer
 */
const assignCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({ success: false, message: 'customerId or email is required' });
    }

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    let user;
    if (customerId.includes('@')) {
      user = await User.findOne({ email: customerId.toLowerCase() });
    } else {
      user = await User.findById(customerId);
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'Customer account not found' });
    }

    const previousCustomer = shipment.customer;
    shipment.customer = user._id;
    await shipment.save();

    // Audit Log
    AuditLog.create({
      user: req.user._id,
      actor: req.user._id,
      actorRole: req.user.role,
      action: 'SHIPMENT_CUSTOMER_ASSIGNED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: {
        previousCustomer,
        newCustomer: user._id,
        customerEmail: user.email
      }
    }).catch(() => {});

    // In-App Notification to user
    createCustomerNotification({
      userId: user._id,
      shipmentId: shipment._id,
      trackingNumber: shipment.trackingNumber,
      type: 'INFO',
      title: 'Shipment Linked to Your Account',
      message: `Shipment ${shipment.trackingNumber} has been linked to your account dashboard.`
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: `Customer ${user.name} (${user.email}) successfully assigned to shipment`,
      data: {
        trackingNumber: shipment.trackingNumber,
        customer: {
          _id: user._id,
          name: user.name,
          email: user.email
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Assign Staff / Courier to Shipment
 * @route PATCH /api/shipments/:id/assign-staff
 */
const assignStaff = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { staffId, notes = '' } = req.body;

    if (!staffId) {
      return res.status(400).json({ success: false, message: 'staffId is required' });
    }

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    const staffUser = await User.findById(staffId);
    if (!staffUser) {
      return res.status(404).json({ success: false, message: 'Staff user not found' });
    }

    shipment.assignedStaff = staffUser._id;
    await shipment.save();

    await ShipmentAssignment.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      assignedTo: staffUser._id,
      assignedBy: req.user._id,
      status: 'assigned',
      notes
    });

    // Audit Log
    AuditLog.create({
      user: req.user._id,
      actor: req.user._id,
      actorRole: req.user.role,
      action: 'SHIPMENT_STAFF_ASSIGNED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: {
        staffId: staffUser._id,
        staffName: staffUser.name,
        staffRole: staffUser.role
      }
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: `Staff member ${staffUser.name} successfully assigned to shipment`,
      data: {
        trackingNumber: shipment.trackingNumber,
        assignedStaff: {
          _id: staffUser._id,
          name: staffUser.name,
          email: staffUser.email,
          role: staffUser.role
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Cancel Shipment
 * @route POST /api/shipments/:id/cancel
 */
const cancelShipment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason = 'Cancelled by administrator' } = req.body;

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    const previousStatus = shipment.status;
    shipment.status = 'cancelled';
    shipment.statusReason = reason;
    await shipment.save();
    invalidateDashboardCache();

    // Event
    const event = await ShipmentEvent.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      eventType: 'CANCELLED',
      previousStatus,
      newStatus: 'cancelled',
      title: 'Shipment Cancelled',
      description: reason,
      locationName: shipment.currentCoordinates.city || shipment.origin.city,
      coordinates: shipment.currentCoordinates,
      actor: req.user._id,
      actorRole: req.user.role,
      isPublic: true,
      customerVisible: true
    });

    // Audit Log
    AuditLog.create({
      user: req.user._id,
      actor: req.user._id,
      actorRole: req.user.role,
      action: 'SHIPMENT_CANCELLED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: { previousStatus, reason }
    }).catch(() => {});

    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:status_changed', {
      trackingNumber: shipment.trackingNumber,
      status: 'cancelled',
      statusTitle: 'Shipment Cancelled',
      description: reason,
      color: '#64748b'
    });

    sendShipmentStatusAlert(shipment, 'Shipment Cancelled', reason, '#64748b');
    notifyShipmentStakeholders(shipment, 'Shipment Cancelled', reason, 'WARNING').catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Shipment has been cancelled',
      data: { shipment, event }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Mark Shipment Delivered
 * @route POST /api/shipments/:id/deliver
 */
const markDelivered = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { recipientName, notes = 'Delivered to recipient', deliveredAt = new Date(), signatureUrl = '' } = req.body;

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    const previousStatus = shipment.status;
    const actualDelivery = new Date(deliveredAt);

    shipment.status = 'delivered';
    shipment.statusReason = notes;
    shipment.progressPercentage = 100;
    shipment.deliveredAt = actualDelivery;
    shipment.actualDeliveryDate = actualDelivery;
    shipment.currentCoordinates = {
      lat: shipment.destination.coordinates.lat,
      lng: shipment.destination.coordinates.lng,
      address: shipment.destination.address,
      city: shipment.destination.city,
      country: shipment.destination.country,
      updatedAt: actualDelivery
    };

    await shipment.save();
    invalidateDashboardCache();

    // Record Successful Delivery Attempt
    await DeliveryAttempt.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      attemptNumber: 1,
      attemptedAt: actualDelivery,
      status: 'successful',
      isSuccessful: true,
      receiverName: recipientName || shipment.recipient.name,
      signatureUrl,
      notes,
      performedBy: req.user._id
    });

    // Milestone Event
    const event = await ShipmentEvent.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      eventType: 'DELIVERED',
      previousStatus,
      newStatus: 'delivered',
      title: 'Delivered Successfully',
      description: `Shipment delivered to ${recipientName || shipment.recipient.name}. ${notes}`,
      locationName: `${shipment.destination.city}, ${shipment.destination.country}`,
      coordinates: shipment.destination.coordinates,
      actor: req.user._id,
      actorRole: req.user.role,
      isPublic: true,
      customerVisible: true
    });

    // Audit Log
    AuditLog.create({
      user: req.user._id,
      actor: req.user._id,
      actorRole: req.user.role,
      action: 'SHIPMENT_DELIVERED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: {
        deliveredTo: recipientName || shipment.recipient.name,
        deliveredAt: actualDelivery,
        notes
      }
    }).catch(() => {});

    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:status_changed', {
      trackingNumber: shipment.trackingNumber,
      status: 'delivered',
      statusTitle: 'Delivered Successfully',
      description: `Shipment delivered to ${recipientName || shipment.recipient.name}`,
      progressPercentage: 100,
      color: '#16a34a'
    });

    sendShipmentStatusAlert(
      shipment,
      'Shipment Delivered Successfully',
      `Your consignment has been delivered to ${recipientName || shipment.recipient.name}. Thank you for shipping with Express Cargo.`,
      '#16a34a'
    );

    notifyShipmentStakeholders(
      shipment,
      'Shipment Delivered',
      `Your shipment ${shipment.trackingNumber} has been delivered successfully.`,
      'DELIVERY_SUCCESS'
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Shipment marked as successfully delivered',
      data: { shipment, event }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Add Customer-Visible (Public) Note / Event
 * @route POST /api/shipments/:id/notes/public
 */
const addPublicNote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title = 'Shipment Advisory', description } = req.body;

    if (!description) {
      return res.status(400).json({ success: false, message: 'Note description is required' });
    }

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    const event = await ShipmentEvent.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      eventType: 'ADVISORY',
      title,
      description,
      locationName: shipment.currentCoordinates.city || shipment.origin.city,
      coordinates: shipment.currentCoordinates,
      actor: req.user._id,
      actorRole: req.user.role,
      isPublic: true,
      customerVisible: true
    });

    // Audit Log
    AuditLog.create({
      user: req.user._id,
      actor: req.user._id,
      actorRole: req.user.role,
      action: 'PUBLIC_NOTE_ADDED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: { title, description }
    }).catch(() => {});

    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:note_added', {
      trackingNumber: shipment.trackingNumber,
      event
    });

    res.status(201).json({
      success: true,
      message: 'Customer-visible note added successfully',
      data: event
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Add Internal Admin Note
 * @route POST /api/shipments/:id/notes/internal
 */
const addInternalNote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    if (!note) {
      return res.status(400).json({ success: false, message: 'Note content is required' });
    }

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    const event = await ShipmentEvent.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      eventType: 'INTERNAL_NOTE',
      title: 'Internal Staff Note',
      description: note,
      locationName: shipment.currentCoordinates.city || 'Internal Operations',
      coordinates: shipment.currentCoordinates,
      actor: req.user._id,
      actorRole: req.user.role,
      isPublic: false,
      customerVisible: false
    });

    shipment.notes = shipment.notes ? `${shipment.notes}\n[${new Date().toISOString()}] ${note}` : note;
    await shipment.save();

    // Audit Log
    AuditLog.create({
      user: req.user._id,
      actor: req.user._id,
      actorRole: req.user.role,
      action: 'INTERNAL_NOTE_ADDED',
      targetType: 'Shipment',
      targetId: shipment.trackingNumber,
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: { note }
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Internal note recorded',
      data: event
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Upload Shipment Document (Air Waybill, Commercial Invoice, Customs, etc.)
 * @route POST /api/shipments/:id/documents
 */
const uploadShipmentDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, documentType = 'air_waybill', isPublic = 'false', fileUrl: directUrl } = req.body;

    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    let fileUrl = directUrl;
    let publicId = '';
    let fileSize = 0;
    let mimeType = 'application/pdf';

    if (req.file) {
      fileUrl = req.file.path || req.file.secure_url || req.file.url;
      publicId = req.file.filename || req.file.public_id || '';
      fileSize = req.file.size || 0;
      mimeType = req.file.mimetype || 'application/pdf';
    }

    if (!fileUrl) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a document file or supply a valid fileUrl'
      });
    }

    const doc = await ShipmentDocument.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      title: title || `${documentType.replace(/_/g, ' ').toUpperCase()} - ${shipment.trackingNumber}`,
      documentType,
      fileUrl,
      publicId,
      fileSize,
      mimeType,
      uploadedBy: req.user._id,
      isPublic: isPublic === 'true' || isPublic === true
    });

    // Audit Log
    AuditLog.create({
      user: req.user._id,
      actor: req.user._id,
      actorRole: req.user.role,
      action: 'DOCUMENT_UPLOADED',
      targetType: 'ShipmentDocument',
      targetId: doc._id.toString(),
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: {
        trackingNumber: shipment.trackingNumber,
        documentType,
        title: doc.title,
        isPublic: doc.isPublic
      }
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: doc
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get Shipment Documents
 * @route GET /api/shipments/:id/documents
 */
const getShipmentDocuments = async (req, res, next) => {
  try {
    const { id } = req.params;
    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    const documents = await ShipmentDocument.find({ shipment: shipment._id })
      .populate('uploadedBy', 'name email role')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: documents
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Delete Shipment Document
 * @route DELETE /api/shipments/:id/documents/:docId
 */
const deleteShipmentDocument = async (req, res, next) => {
  try {
    const { id, docId } = req.params;

    const doc = await ShipmentDocument.findById(docId);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    if (doc.publicId) {
      const resourceType = doc.mimeType === 'application/pdf' ? 'raw' : 'image';
      deleteFromCloudinary(doc.publicId, resourceType).catch(() => {});
    }

    await doc.deleteOne();

    // Audit Log
    AuditLog.create({
      user: req.user._id,
      actor: req.user._id,
      actorRole: req.user.role,
      action: 'DOCUMENT_DELETED',
      targetType: 'ShipmentDocument',
      targetId: doc._id.toString(),
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: {
        title: doc.title,
        documentType: doc.documentType
      }
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Document successfully deleted'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Quickly start automated time-based simulation (Sets to In Transit & resyncs clock)
 * @route POST /api/shipments/:id/start-auto-simulation
 * @access Private (Admin)
 */
const startAutoSimulation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const shipment = await Shipment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { trackingNumber: id.toUpperCase() }]
    });

    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    // Reset startedAt to NOW, switch status to in_transit
    shipment.status = 'in_transit';
    shipment.startedAt = new Date();
    shipment.dispatchDate = new Date();
    shipment.progressPercentage = 5; 
    shipment.statusReason = 'Shipment activated for auto-simulation transit.';
    shipment.trackingSource = 'simulation';

    // Set an appropriate system ETA based on configured duration hours
    const dHours = Number(shipment.durationHours) || 24;
    const computedETA = new Date(shipment.startedAt.getTime() + dHours * 60 * 60 * 1000);
    shipment.estimatedDeliveryDate = computedETA;
    shipment.expectedDeliveryAt = computedETA;
    shipment.systemETA = computedETA;

    // Reset pause history and emails so the 0% email fires immediately
    shipment.pauseDetails = { isPaused: false, totalPausedDurationMs: 0 };
    shipment.emailedMilestones = [];

    await shipment.save();

    // Log Event
    await ShipmentEvent.create({
      shipment: shipment._id,
      trackingNumber: shipment.trackingNumber,
      eventType: 'IN_TRANSIT',
      title: 'Simulation Started',
      description: 'Shipment auto-simulation has been kick-started.',
      locationName: shipment.origin.city,
      coordinates: shipment.origin.coordinates,
      isPublic: true,
      timestamp: new Date()
    });
    
    // Broadcast immediately so the map UI picks it up without waiting for the 10-second polling interval
    const { broadcastShipmentUpdate } = require('../config/socket');
    broadcastShipmentUpdate(shipment.trackingNumber, 'shipment:status_changed', {
      trackingNumber: shipment.trackingNumber,
      newStatus: shipment.status,
      statusTitle: 'In Transit',
      description: shipment.statusReason,
      progressPercentage: 5,
      currentLocation: shipment.currentCoordinates || shipment.origin.coordinates
    });

    res.status(200).json({
      success: true,
      message: 'Simulation successfully started. The progress will now auto-increment.',
      data: shipment
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
};
