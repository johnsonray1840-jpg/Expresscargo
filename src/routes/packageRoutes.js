const express = require('express');
const router = express.Router();
const {
  createPackage,
  getAllPackages,
  getPackageById,
  updatePackage,
  associatePackageWithShipment,
  uploadPackageImages,
  deletePackage
} = require('../controllers/packageController');
const { protect, authorize } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');

// All package operations require staff or admin privileges
router.use(protect);
router.use(authorize('admin', 'super_admin', 'staff'));

router.post('/', createPackage);
router.get('/', getAllPackages);
router.get('/:id', getPackageById);
router.put('/:id', updatePackage);
router.post('/:id/assign', associatePackageWithShipment);
router.post('/:id/images', upload.array('images', 5), uploadPackageImages);
router.delete('/:id', deletePackage);

module.exports = router;

