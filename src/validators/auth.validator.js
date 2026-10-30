const { body, query, validationResult } = require('express-validator');

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

// Sign up validation rules
const validateSignUp = [
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

  // Role is forced to customer; ignore/validate if provided
  body('role')
    .optional()
    .equals('customer')
    .withMessage('Role must be customer'),
  
  handleValidationErrors
];

// Login validation rules
const validateLogin = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  body('fcmToken')
    .optional()
    .isString()
    .withMessage('FCM token must be a string'),
  
  handleValidationErrors
];

const validateUserProfileQuery = [
  query('userId')
    .notEmpty()
    .withMessage('userId is required')
    .isInt({ min: 1 })
    .withMessage('userId must be a positive integer'),

  handleValidationErrors
];

const validateChangePassword = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required')
    .isLength({ min: 6 })
    .withMessage('Current password must be at least 6 characters long'),

  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('New password must be different from current password');
      }
      return true;
    }),

  handleValidationErrors
];

const validateForgotPassword = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Email must be a valid email address')
    .normalizeEmail(),

  body('role')
    .optional()
    .isIn(['customer', 'operator'])
    .withMessage('Role must be either customer or operator'),

  handleValidationErrors
];

const validateVerifyForgotPasswordOtp = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Email must be a valid email address')
    .normalizeEmail(),

  body('otp')
    .trim()
    .notEmpty()
    .withMessage('OTP is required')
    .matches(/^\d{6}$/)
    .withMessage('OTP must be a 6-digit code'),

  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long'),

  body('role')
    .optional()
    .isIn(['customer', 'operator'])
    .withMessage('Role must be either customer or operator'),

  handleValidationErrors
];

module.exports = {
  validateSignUp,
  validateLogin,
  validateUserProfileQuery,
  validateChangePassword,
  validateForgotPassword,
  validateVerifyForgotPasswordOtp
};
