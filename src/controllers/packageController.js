const { Package, Shipment, AuditLog } = require('../models');
const { packageSchema, updatePackageSchema } = require('../validations/packageValidation');
const { broadcastShipmentUpdate } = require('../config/socket');
const { cloudinary } = require('../config/cloudinary');
const logger = require('../utils/logger');

/**
 * @desc Create a new package (and optionally associate with a shipment)
 * @route POST /api/packages
 */
const createPackage = async (req, res, next) => {
  try {
    const validatedData = packageSchema.parse(req.body);

    let shipmentDoc = null;
    if (validatedData.shipmentId) {
      shipmentDoc = await Shipment.findById(validatedData.shipmentId);
    } else if (validatedData.trackingNumber) {
      shipmentDoc = await Shipment.findOne({ trackingNumber: validatedData.trackingNumber.toUpperCase() });
    }

    if (validatedData.shipmentId && !shipmentDoc) {
      return res.status(404).json({
        success: false,
        error: 'Specified shipment does not exist.'
      });
    }

    const trackingNumber = shipmentDoc ? shipmentDoc.trackingNumber : (validatedData.trackingNumber || 'UNASSIGNED').toUpperCase();

    const packageDoc = new Package({
      ...validatedData,
      shipment: shipmentDoc ? shipmentDoc._id : null,
      trackingNumber,
      barcodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(trackingNumber)}`,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(trackingNumber)}`
    });

    await packageDoc.save();

    // Audit Log
    AuditLog.create({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'PACKAGE_CREATED',
      targetType: 'Package',
      targetId: packageDoc._id.toString(),
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: {
        packageId: packageDoc._id,
        trackingNumber: packageDoc.trackingNumber,
        category: packageDoc.category
      }
    }).catch(() => {});

    if (shipmentDoc) {
      broadcastShipmentUpdate(shipmentDoc.trackingNumber, 'package:added', {
        trackingNumber: shipmentDoc.trackingNumber,
        package: packageDoc
      });
    }

    res.status(201).json({
      success: true,
      message: 'Package created successfully.',
      data: packageDoc
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get all packages (with pagination and filter)
 * @route GET /api/packages
 */
const getAllPackages = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.shipmentId) filter.shipment = req.query.shipmentId;
    if (req.query.trackingNumber) filter.trackingNumber = req.query.trackingNumber.toUpperCase();
    if (req.query.category) filter.category = req.query.category;

    const [packages, total] = await Promise.all([
      Package.find(filter).populate('shipment', 'trackingNumber status origin.city destination.city').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Package.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      count: packages.length,
      data: packages
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get single package details
 * @route GET /api/packages/:id
 */
const getPackageById = async (req, res, next) => {
  try {
    const packageDoc = await Package.findById(req.params.id).populate('shipment').lean();

    if (!packageDoc) {
      return res.status(404).json({
        success: false,
        error: 'Package not found'
      });
    }

    res.status(200).json({
      success: true,
      data: packageDoc
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Update package details
 * @route PUT /api/packages/:id
 */
const updatePackage = async (req, res, next) => {
  try {
    const validatedData = updatePackageSchema.parse(req.body);

    const packageDoc = await Package.findById(req.params.id);
    if (!packageDoc) {
      return res.status(404).json({
        success: false,
        error: 'Package not found'
      });
    }

    Object.assign(packageDoc, validatedData);
    await packageDoc.save();

    // Audit Log
    AuditLog.create({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'PACKAGE_UPDATED',
      targetType: 'Package',
      targetId: packageDoc._id.toString(),
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: validatedData
    }).catch(() => {});

    if (packageDoc.trackingNumber && packageDoc.trackingNumber !== 'UNASSIGNED') {
      broadcastShipmentUpdate(packageDoc.trackingNumber, 'package:updated', {
        trackingNumber: packageDoc.trackingNumber,
        package: packageDoc
      });
    }

    res.status(200).json({
      success: true,
      message: 'Package updated successfully.',
      data: packageDoc
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Associate/reassign package to a shipment
 * @route POST /api/packages/:id/assign
 */
const associatePackageWithShipment = async (req, res, next) => {
  try {
    const { shipmentId, trackingNumber } = req.body;

    let shipmentDoc = null;
    if (shipmentId) {
      shipmentDoc = await Shipment.findById(shipmentId);
    } else if (trackingNumber) {
      shipmentDoc = await Shipment.findOne({ trackingNumber: trackingNumber.toUpperCase() });
    }

    if (!shipmentDoc) {
      return res.status(404).json({
        success: false,
        error: 'Shipment to associate with was not found.'
      });
    }

    const packageDoc = await Package.findById(req.params.id);
    if (!packageDoc) {
      return res.status(404).json({
        success: false,
        error: 'Package not found.'
      });
    }

    packageDoc.shipment = shipmentDoc._id;
    packageDoc.trackingNumber = shipmentDoc.trackingNumber;
    packageDoc.barcodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shipmentDoc.trackingNumber)}`;
    packageDoc.qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shipmentDoc.trackingNumber)}`;
    await packageDoc.save();

    // Audit Log
    AuditLog.create({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'PACKAGE_ASSIGNED',
      targetType: 'Package',
      targetId: packageDoc._id.toString(),
      details: {
        packageId: packageDoc._id,
        shipmentId: shipmentDoc._id,
        trackingNumber: shipmentDoc.trackingNumber
      }
    }).catch(() => {});

    broadcastShipmentUpdate(shipmentDoc.trackingNumber, 'package:assigned', {
      trackingNumber: shipmentDoc.trackingNumber,
      package: packageDoc
    });

    res.status(200).json({
      success: true,
      message: `Package successfully assigned to shipment ${shipmentDoc.trackingNumber}.`,
      data: packageDoc
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Upload images / documents for a package
 * @route POST /api/packages/:id/images
 */
const uploadPackageImages = async (req, res, next) => {
  try {
    const packageDoc = await Package.findById(req.params.id);
    if (!packageDoc) {
      return res.status(404).json({
        success: false,
        error: 'Package not found.'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No image files uploaded.'
      });
    }

    // Process uploaded files (Cloudinary or buffer fallback)
    const uploadedImages = req.files.map((file) => ({
      url: file.path || file.secure_url || `data:${file.mimetype};base64,${file.buffer ? file.buffer.toString('base64') : ''}`,
      publicId: file.filename || file.originalname,
      caption: req.body.caption || file.originalname
    }));

    packageDoc.packageImages.push(...uploadedImages);
    await packageDoc.save();

    res.status(200).json({
      success: true,
      message: `${uploadedImages.length} image(s) uploaded and attached to package.`,
      images: packageDoc.packageImages
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Delete a package
 * @route DELETE /api/packages/:id
 */
const deletePackage = async (req, res, next) => {
  try {
    const packageDoc = await Package.findByIdAndDelete(req.params.id);
    if (!packageDoc) {
      return res.status(404).json({
        success: false,
        error: 'Package not found'
      });
    }

    // Audit Log
    AuditLog.create({
      user: req.user._id,
      userEmail: req.user.email,
      action: 'PACKAGE_DELETED',
      targetType: 'Package',
      targetId: req.params.id,
      details: { trackingNumber: packageDoc.trackingNumber, description: packageDoc.description }
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Package deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPackage,
  getAllPackages,
  getPackageById,
  updatePackage,
  associatePackageWithShipment,
  uploadPackageImages,
  deletePackage
};

