const { body, validationResult } = require('express-validator');
const { CAR_TYPE_VALUES } = require('../utils/constant');
const { PARKING_SYSTEM_STATUS_VALUES } = require('../constants/parkingSystemStatus');

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

// Car in — locate pallet by floor + column within operator parking system
const validateCarIn = [
  body('floor')
    .notEmpty()
    .withMessage('Floor is required')
    .isInt({ min: 1 })
    .withMessage('Floor must be a positive integer'),
  body('floorColumn')
    .notEmpty()
    .withMessage('Floor column is required')
    .isInt({ min: 1 })
    .withMessage('Floor column must be a positive integer'),

  body('parkingRequestId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Parking Request ID must be a valid integer'),
  
  body('carNumber')
    .optional()
    .isString()
    .withMessage('Car number must be a string')
    .matches(/^\d{4}$/)
    .withMessage('Car number must be exactly 4 digits (last 4 of plate; matched within this project and parking system, same as car retrieve)'),
  
  // Custom validation to ensure either parkingRequestId or carNumber is provided
  body().custom((value) => {
    if (!value.parkingRequestId && !value.carNumber) {
      throw new Error('Either parkingRequestId or carNumber must be provided');
    }
    if (value.parkingRequestId && value.carNumber) {
      throw new Error('Cannot provide both parkingRequestId and carNumber. Please provide only one.');
    }
    return true;
  }),
  
  handleValidationErrors
];

const validateAssignPallet = validateCarIn;

// Park car — assign pallet slot then complete parking request
const validateParkCar = [
  body('parkingRequestId')
    .notEmpty()
    .withMessage('Parking request ID is required')
    .isInt({ min: 1 })
    .withMessage('Parking Request ID must be a valid integer'),
  body('palletId')
    .notEmpty()
    .withMessage('Pallet ID is required')
    .isInt({ min: 1 })
    .withMessage('Pallet ID must be a valid integer'),
  body('syncUuid')
    .optional({ nullable: true })
    .isString()
    .withMessage('syncUuid must be a string')
    .trim()
    .isLength({ min: 1, max: 64 })
    .withMessage('syncUuid must be 1-64 characters'),

  handleValidationErrors
];

// Request car release validation rules
const validateRequestCarRelease = [
  body('palletId')
    .notEmpty()
    .withMessage('Pallet ID is required')
    .isInt({ min: 1 })
    .withMessage('Pallet ID must be a valid integer'),
  
  handleValidationErrors
];

// Update request status validation rules
const validateUpdateRequestStatus = [
  body('status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn(['Pending', 'Accepted', 'Queued', 'Completed', 'Cancelled'])
    .withMessage('Status must be one of: Pending, Accepted, Queued, Completed, Cancelled'),
  
  handleValidationErrors
];

// Call empty pallet validation rules
const validateCallEmptyPallet = [
  body('carType')
    .optional()
    .isIn([...CAR_TYPE_VALUES])
    .withMessage(`Car type must be one of: ${CAR_TYPE_VALUES.join(', ')}`),
  body('customerId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Customer ID must be a valid integer'),

  handleValidationErrors
];

// Update parking system status validation rules
const validateUpdateParkingSystemStatus = [
  body('status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn([...PARKING_SYSTEM_STATUS_VALUES])
    .withMessage(`Status must be one of: ${PARKING_SYSTEM_STATUS_VALUES.join(', ')}`),
  
  handleValidationErrors
];

// Release parked car — identify the active release request by id
const validateReleaseParkedCar = [
  body('requestId')
    .notEmpty()
    .withMessage('requestId is required')
    .isInt({ min: 1 })
    .withMessage('requestId must be a valid integer'),
  body('syncUuid')
    .optional({ nullable: true })
    .isString()
    .withMessage('syncUuid must be a string')
    .trim()
    .isLength({ min: 1, max: 64 })
    .withMessage('syncUuid must be 1-64 characters'),

  handleValidationErrors
];

// Unified car-out: exactly one of carNumber (4 digits) or requestId
const validateCarOut = [
  body('carNumber')
    .optional()
    .isString()
    .withMessage('carNumber must be a string')
    .matches(/^\d{4}$/)
    .withMessage('carNumber must be exactly 4 digits (last 4 of plate)'),
  body('requestId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('requestId must be a positive integer'),
  body('currentFloor')
    .optional()
    .isInt({ min: 0 })
    .withMessage('currentFloor must be an integer >= 0'),
  body('palletFloor')
    .optional()
    .isInt({ min: 0 })
    .withMessage('palletFloor must be an integer >= 0'),
  body('tt')
    .optional()
    .isInt()
    .withMessage('tt must be an integer'),
  body('w310')
    .optional()
    .isInt({ min: 0, max: 1 })
    .withMessage('w310 must be 0 or 1'),
  body('w313')
    .optional()
    .isInt({ min: 0, max: 1 })
    .withMessage('w313 must be 0 or 1'),
  body().custom((value) => {
    const hasC = value.carNumber != null && String(value.carNumber).trim() !== '';
    const hasR = value.requestId != null && value.requestId !== '' && !Number.isNaN(parseInt(value.requestId, 10));
    if (hasC === hasR) {
      throw new Error('Provide exactly one of carNumber or requestId');
    }
    return true;
  }),
  handleValidationErrors
];

// Call specific pallet validation rules
const validateCallSpecificPallet = [
  body('palletId')
    .notEmpty()
    .withMessage('Pallet ID is required')
    .isInt({ min: 1 })
    .withMessage('Pallet ID must be a valid integer'),
  
  body('requestId')
    .notEmpty()
    .withMessage('Request ID is required')
    .isInt({ min: 1 })
    .withMessage('Request ID must be a valid integer'),
  
  handleValidationErrors
];

// Call pallet and create request validation rules
const validateCallPalletAndCreateRequest = [
  body('palletId')
    .notEmpty()
    .withMessage('Pallet ID is required')
    .isInt({ min: 1 })
    .withMessage('Pallet ID must be a valid integer'),
  
  handleValidationErrors
];

// Car retrieve (call-pallet-by-car-number): last 4 digits of plate
const validateCallPalletByCarNumber = [
  body('carNumber')
    .notEmpty()
    .withMessage('carNumber is required')
    .isString()
    .withMessage('carNumber must be a string')
    .matches(/^\d{4}$/)
    .withMessage('carNumber must be exactly 4 digits (last 4 of plate for this project and parking system)'),
  
  handleValidationErrors
];

module.exports = {
  validateCarIn,
  validateAssignPallet,
  validateParkCar,
  validateRequestCarRelease,
  validateUpdateRequestStatus,
  validateCallEmptyPallet,
  validateUpdateParkingSystemStatus,
  validateReleaseParkedCar,
  validateCarOut,
  validateCallSpecificPallet,
  validateCallPalletAndCreateRequest,
  validateCallPalletByCarNumber
};

