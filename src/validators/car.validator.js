const { body, param, validationResult } = require('express-validator');
const { CAR_TYPE_VALUES } = require('../utils/constant');

// Validation result handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

const carIdParam = [
  param('carId')
    .isInt({ min: 1 })
    .withMessage('carId must be a positive integer')
    .toInt()
];

// Create car validation rules
const validateCreateCar = [
  body('carType')
    .optional()
    .trim()
    .isIn(CAR_TYPE_VALUES)
    .withMessage(`Car type must be one of: ${CAR_TYPE_VALUES.join(', ')}`),
  
  body('carModel')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Car model must not exceed 100 characters'),
  
  body('carCompany')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Car company must not exceed 100 characters'),
  
  body('carNumber')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Car number must not exceed 50 characters'),
  
  handleValidationErrors
];

// Update car validation rules (at least one field required)
const validateUpdateCar = [
  ...carIdParam,

  body('carType')
    .optional()
    .trim()
    .isIn(CAR_TYPE_VALUES)
    .withMessage(`Car type must be one of: ${CAR_TYPE_VALUES.join(', ')}`),

  body('carModel')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Car model must not exceed 100 characters'),

  body('carCompany')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Car company must not exceed 100 characters'),

  body('carNumber')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Car number must not exceed 50 characters'),

  body().custom((_, { req }) => {
    const { carType, carModel, carCompany, carNumber } = req.body || {};
    if (
      carType === undefined &&
      carModel === undefined &&
      carCompany === undefined &&
      carNumber === undefined
    ) {
      throw new Error('At least one of carType, carModel, carCompany, or carNumber is required');
    }
    return true;
  }),

  handleValidationErrors
];

const validateDeleteCar = [
  ...carIdParam,
  handleValidationErrors
];

module.exports = {
  validateCreateCar,
  validateUpdateCar,
  validateDeleteCar
};
