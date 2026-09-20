const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');

// Submit General Contact Message
router.post('/', contactController.submitContact);

// Submit Quote Request
router.post('/quote', contactController.submitQuote);

module.exports = router;

