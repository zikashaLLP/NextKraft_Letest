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

// Create parking system validation rules
const validateCreateParkingSystem = [
  body('projectName')
    .trim()
    .notEmpty()
    .withMessage('Project name is required')
    .isLength({ min: 1, max: 150 })
    .withMessage('Project name must be between 1 and 150 characters'),
  
  body('societyName')
    .trim()
    .notEmpty()
    .withMessage('Society name is required')
    .isLength({ min: 1, max: 150 })
    .withMessage('Society name must be between 1 and 150 characters'),
  
  body('wingName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Wing name must not exceed 100 characters'),
  
  body('type')
    .notEmpty()
    .withMessage('Type is required')
    .isIn(['Tower', 'Puzzle'])
    .withMessage('Type must be either Tower or Puzzle'),
  
  body('level')
    .notEmpty()
    .withMessage('Level (Level Above Ground) is required')
    .isInt({ min: 1 })
    .withMessage('Level must be a positive integer'),
  
  body('levelBelowGround')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Level Below Ground must be a non-negative integer')
    .custom((value, { req }) => {
      // If type is Puzzle, levelBelowGround is required
      if (req.body.type === 'Puzzle' && (value === undefined || value === null || value < 0)) {
        throw new Error('Level Below Ground is required for Puzzle parking system');
      }
      // If type is Tower, levelBelowGround should not be provided
      if (req.body.type === 'Tower' && value !== undefined && value !== null) {
        throw new Error('Level Below Ground should not be provided for Tower parking system');
      }
      return true;
    }),
  
  body('column')
    .notEmpty()
    .withMessage('Column is required')
    .isInt({ min: 1 })
    .withMessage('Column must be a positive integer'),
  
  body('timeForEachLevel')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Time for each level must be a non-negative integer'),
  
  body('timeForHorizontalMove')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Time for horizontal move must be a non-negative integer'),
  
  body('bufferTime')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Buffer time must be a non-negative integer'),
  
  handleValidationErrors
];

/** Body: JSON array of { parkingSystemId, floor, floorColumn, PalletNumber, CarType?, TT? } OR { items: [...] } */
const validateBulkUpdatePalletNumbers = (req, res, next) => {
  const rows = Array.isArray(req.body) ? req.body : req.body?.items;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({
      success: false,
      message:
        'Body must be a non-empty array of objects, or { "items": [ ... ] } with a non-empty items array'
    });
  }
  for (let i = 0; i < rows.length; i += 1) {
    const raw = rows[i]?.CarType ?? rows[i]?.carType;
    if (raw !== undefined && raw !== null && raw !== '') {
      const t = String(raw).trim().toLowerCase();
      if (t !== 'sedan' && t !== 'suv' && t !== '1' && t !== '2') {
        return res.status(400).json({
          success: false,
          message: `Invalid CarType at index ${i}: must be Sedan or SUV when provided`
        });
      }
    }
    const ttRaw = rows[i]?.TT ?? rows[i]?.tt ?? rows[i]?.DregisterTTValue;
    if (ttRaw !== undefined && ttRaw !== null && ttRaw !== '') {
      const n = Number(ttRaw);
      if (!Number.isFinite(n)) {
        return res.status(400).json({
          success: false,
          message: `Invalid TT at index ${i}: must be a number when provided`
        });
      }
    }
  }
  next();
};

module.exports = {
  validateCreateParkingSystem,
  validateBulkUpdatePalletNumbers
};

