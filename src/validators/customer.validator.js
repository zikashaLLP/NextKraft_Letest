const { body, validationResult } = require('express-validator');

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

const emailRules = (required = false) => {
  const chain = body('email').trim();
  if (required) {
    chain.notEmpty().withMessage('Email is required');
  } else {
    chain.optional();
  }
  return chain
    .isEmail()
    .withMessage('Email must be a valid email address')
    .isLength({ max: 150 })
    .withMessage('Email must not exceed 150 characters')
    .normalizeEmail();
};

// Create customer validation rules
const validateCreateCustomer = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 100 })
    .withMessage('Username must be between 3 and 100 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('First name must be between 1 and 100 characters'),
  
  body('lastName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Last name must not exceed 100 characters'),
  
  emailRules(true),
  
  body('mobileNumber')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Mobile number must not exceed 20 characters'),
  
  body('projectId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Project ID must be a valid integer'),
  
  body('parkingSystemId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Parking system ID must be a valid integer'),
  
  body('flatNumber')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Flat number must not exceed 50 characters'),
  
  // Custom validation: either projectId or parkingSystemId must be provided
  body().custom((value) => {
    if (!value.projectId && !value.parkingSystemId) {
      throw new Error('Either projectId or parkingSystemId is required');
    }
    return true;
  }),
  
  handleValidationErrors
];

const validateUpdateCustomerProfile = [
  body('firstName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('First name cannot be empty')
    .isLength({ min: 1, max: 100 })
    .withMessage('First name must be between 1 and 100 characters'),

  body('lastName')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Last name must not exceed 100 characters'),

  body('email')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Email cannot be empty')
    .isEmail()
    .withMessage('Email must be a valid email address')
    .isLength({ max: 150 })
    .withMessage('Email must not exceed 150 characters')
    .normalizeEmail(),

  body('mobileNumber')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('Mobile number must not exceed 20 characters'),

  body('flatNumber')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Flat number must not exceed 50 characters'),

  body().custom((_, { req }) => {
    const {
      firstName,
      lastName,
      email,
      mobileNumber,
      flatNumber
    } = req.body || {};

    if (
      firstName === undefined &&
      lastName === undefined &&
      email === undefined &&
      mobileNumber === undefined &&
      flatNumber === undefined
    ) {
      throw new Error(
        'At least one of firstName, lastName, email, mobileNumber, or flatNumber is required'
      );
    }
    return true;
  }),

  handleValidationErrors
];

module.exports = {
  validateCreateCustomer,
  validateUpdateCustomerProfile
};
