const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const logger = require('../utils/logger');

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || ''
});

// Allowed MIME Types Whitelist
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

// Allowed File Extensions Whitelist
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx'];

// Strict File Filter Validator
const documentFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const isMimeValid = ALLOWED_MIME_TYPES.includes(file.mimetype);
  const isExtValid = ALLOWED_EXTENSIONS.includes(ext);

  if (isMimeValid && isExtValid) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type (${file.mimetype} / ${ext}). Allowed formats: PDF, JPG, PNG, WEBP, DOC, DOCX.`), false);
  }
};

// Strict Image Filter Validator
const imageFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp'];
  const allowedImageExts = ['.jpg', '.jpeg', '.png', '.webp'];

  if (allowedImageMimes.includes(file.mimetype) && allowedImageExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid image format (${ext}). Allowed: JPG, PNG, WEBP.`), false);
  }
};

const isCloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
);

let documentUpload;
let imageUpload;

if (isCloudinaryConfigured) {
  // Cloudinary Storage for Documents
  const documentStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      const isPdf = file.mimetype === 'application/pdf';
      return {
        folder: 'express-cargo/documents',
        resource_type: isPdf ? 'raw' : 'auto',
        allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'webp', 'doc', 'docx'],
        public_id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
      };
    }
  });

  // Cloudinary Storage for Package Images & Cargo Photos
  const imageStorage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'express-cargo/cargo-images',
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [{ quality: 'auto', fetch_format: 'auto' }]
    }
  });

  documentUpload = multer({
    storage: documentStorage,
    fileFilter: documentFileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB maximum limit
  });

  imageUpload = multer({
    storage: imageStorage,
    fileFilter: imageFileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
  });
} else {
  // In-Memory Storage Fallback (Safe for dev & non-configured envs, avoids disk pollution)
  const memoryStorage = multer.memoryStorage();

  documentUpload = multer({
    storage: memoryStorage,
    fileFilter: documentFileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }
  });

  imageUpload = multer({
    storage: memoryStorage,
    fileFilter: imageFileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }
  });

  logger.info('Cloudinary credentials not set in environment; using secure in-memory storage fallback');
}

/**
 * Helper to delete a remote asset from Cloudinary
 * @param {string} publicId
 * @param {string} resourceType
 */
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  if (!publicId || !isCloudinaryConfigured) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    logger.info(`Asset deleted from Cloudinary: ${publicId}`);
  } catch (err) {
    logger.warn(`Failed to delete Cloudinary asset ${publicId}:`, err.message);
  }
};

module.exports = {
  cloudinary,
  upload: documentUpload,
  documentUpload,
  imageUpload,
  deleteFromCloudinary
};
