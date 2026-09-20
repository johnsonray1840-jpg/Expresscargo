const authValidation = require('../validations/authValidation');
const shipmentValidation = require('../validations/shipmentValidation');
const packageValidation = require('../validations/packageValidation');

module.exports = {
  ...authValidation,
  ...shipmentValidation,
  ...packageValidation
};

