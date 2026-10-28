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

const validateParkingSync = [
  body('carAllotHistory')
    .isArray({ min: 1 })
    .withMessage('carAllotHistory must be a non-empty array'),
  body('carAllotHistory.*.id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('carAllotHistory id must be a positive integer'),
  body('carAllotHistory.*.syncUuid')
    .notEmpty()
    .withMessage('syncUuid is required for each history row')
    .isString()
    .withMessage('syncUuid must be a string')
    .bail()
    .isLength({ min: 1, max: 64 })
    .withMessage('syncUuid must be 1-64 characters'),
  body('carAllotHistory.*.floorMappingId')
    .notEmpty()
    .withMessage('floorMappingId is required for each history row')
    .isInt({ min: 1 })
    .withMessage('floorMappingId must be a positive integer'),
  body('carAllotHistory.*.carNumber')
    .notEmpty()
    .withMessage('carNumber is required for each history row'),
  body('carAllotHistory.*.parkingTime')
    .notEmpty()
    .withMessage('parkingTime is required')
    .isISO8601()
    .withMessage('parkingTime must be a valid ISO date'),
  body('carAllotHistory.*.retriveTime')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('retriveTime must be a valid ISO date when provided'),
  body('carAllotHistory.*.isParkingSync')
    .optional()
    .isBoolean()
    .withMessage('isParkingSync must be boolean'),
  body('carAllotHistory.*.isRetrivalSync')
    .optional()
    .isBoolean()
    .withMessage('isRetrivalSync must be boolean'),
  body('carAllotHistory.*.floorMapping')
    .notEmpty()
    .withMessage('floorMapping is required for each history row')
    .isObject()
    .withMessage('floorMapping must be an object'),
  body('carAllotHistory.*.floorMapping.id')
    .notEmpty()
    .isInt({ min: 1 })
    .withMessage('floorMapping.id must be a positive integer'),
  body('carAllotHistory.*.floorMapping.parkingSystemId')
    .notEmpty()
    .isInt({ min: 1 })
    .withMessage('floorMapping.parkingSystemId must be a positive integer'),
  body('carAllotHistory.*.floorMapping.floor')
    .notEmpty()
    .isInt()
    .withMessage('floorMapping.floor must be an integer'),
  body('carAllotHistory.*.floorMapping.floorColumn')
    .notEmpty()
    .isInt({ min: 1 })
    .withMessage('floorMapping.floorColumn must be a positive integer'),
  handleValidationErrors
];

module.exports = {
  validateParkingSync
};
