const { body, validationResult } = require('express-validator');

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

const platformVersionRules = (platform) => [
  body(`${platform}`)
    .optional()
    .isObject()
    .withMessage(`${platform} must be an object`),

  body(`${platform}.latest_version`)
    .optional()
    .trim()
    .notEmpty()
    .withMessage(`${platform}.latest_version cannot be empty`)
    .isLength({ max: 32 })
    .withMessage(`${platform}.latest_version must not exceed 32 characters`)
    .matches(/^\d+(\.\d+)*$/)
    .withMessage(`${platform}.latest_version must be a version string like 3.1.10`),

  body(`${platform}.min_supported_version`)
    .optional()
    .trim()
    .notEmpty()
    .withMessage(`${platform}.min_supported_version cannot be empty`)
    .isLength({ max: 32 })
    .withMessage(`${platform}.min_supported_version must not exceed 32 characters`)
    .matches(/^\d+(\.\d+)*$/)
    .withMessage(`${platform}.min_supported_version must be a version string like 3.1.10`),

  body(`${platform}.app_url`)
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage(`${platform}.app_url must not exceed 500 characters`)
];

const validateUpdateMobileVersion = [
  ...platformVersionRules('ios'),
  ...platformVersionRules('android'),

  body('message')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('message cannot be empty')
    .isLength({ max: 500 })
    .withMessage('message must not exceed 500 characters'),

  body().custom((_, { req }) => {
    const { ios, android, message } = req.body || {};
    if (ios === undefined && android === undefined && message === undefined) {
      throw new Error('At least one of ios, android, or message is required');
    }
    return true;
  }),

  handleValidationErrors
];

module.exports = {
  validateUpdateMobileVersion
};
