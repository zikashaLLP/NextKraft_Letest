const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const parkingSystemController = require('../controllers/parkingSystem.controller');
const operatorController = require('../controllers/operator.controller');
const customerController = require('../controllers/customer.controller');
const { validateCreateParkingSystem, validateBulkUpdatePalletNumbers } = require('../validators/parkingSystem.validator');
const { validateUpdatePalletPower } = require('../validators/operator.validator');

// Public routes (no authentication required)
/**
 * @swagger
 * /api/admin/projects:
 *   get:
 *     summary: Get list of all projects with their parking systems (Public - No authentication required)
 *     description: Returns a list of all projects with their basic parking system details. Pallet details are excluded. This endpoint is publicly accessible.
 *     tags: [Admin]
 *     security: []
 *     responses:
 *       200:
 *         description: Project list with parking systems retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     projects:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           projectName:
 *                             type: string
 *                           societyName:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                           parkingSystems:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                 wingName:
 *                                   type: string
 *                                 projectId:
 *                                   type: integer
 *                                 type:
 *                                   type: string
 *                                   enum: [Tower, Puzzle]
 *                                 level:
 *                                   type: integer
 *                                 column:
 *                                   type: integer
 *                                 totalNumberOfPallet:
 *                                   type: integer
 *                                 timeForEachLevel:
 *                                   type: integer
 *                                 timeForHorizontalMove:
 *                                   type: integer
 *                                 bufferTime:
 *                                   type: integer
 *                                   description: Buffer time in seconds
 *                                 createdAt:
 *                                   type: string
 *                                   format: date-time
 *                                 updatedAt:
 *                                   type: string
 *                                   format: date-time
 *                     count:
 *                       type: integer
 *                       description: Total number of projects
 *       500:
 *         description: Server error
 */
router.get('/projects', parkingSystemController.getProjectListWithParkingSystems);

/**
 * @swagger
 * /api/admin/project-details:
 *   get:
 *     summary: Get project details with parking system and all pallet details (Admin only)
 *     description: Returns complete project information including its parking system and all associated pallet details. Since there is one parking system per project, only projectId is required.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Project ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Project details with parking system and pallets retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     project:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         projectName:
 *                           type: string
 *                         societyName:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     parkingSystem:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: integer
 *                         wingName:
 *                           type: string
 *                         projectId:
 *                           type: integer
 *                         type:
 *                           type: string
 *                           enum: [Tower, Puzzle]
 *                         level:
 *                           type: integer
 *                         levelBelowGround: 
 *                           type: integer
 *                           nullable: true
 *                         column:
 *                           type: integer
 *                         totalNumberOfPallet:
 *                           type: integer
 *                         timeForEachLevel:
 *                           type: integer
 *                         timeForHorizontalMove:
 *                           type: integer
 *                         bufferTime:
 *                           type: integer
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     palletDetails:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           userId:
 *                             type: integer
 *                           projectId:
 *                             type: integer
 *                           parkingSystemId:
 *                             type: integer
 *                           level:
 *                             type: integer
 *                             nullable: true
 *                           levelBelowGround:
 *                             type: integer
 *                             nullable: true
 *                           column:
 *                             type: integer
 *                           userGivenPalletNumber:
 *                             type: string
 *                           carId:
 *                             type: integer
 *                             nullable: true
 *                           car:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               carType:
 *                                 type: string
 *                               carModel:
 *                                 type: string
 *                               carCompany:
 *                                 type: string
 *                               carNumber:
 *                                 type: string
 *                               user:
 *                                 type: object
 *                                 nullable: true
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                   username:
 *                                     type: string
 *                           status:
 *                             type: string
 *                             enum: [Assigned, Released]
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     count:
 *                       type: integer
 *                       description: Total number of pallets
 *       400:
 *         description: Project ID is required
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Project not found
 */
// authenticate must run before authorize (sets req.user from JWT)
router.get(
  '/project-details',
  authenticate,
  authorize('admin'),
  parkingSystemController.getProjectDetailsWithParkingSystemAndPallets
);

// All routes below require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/admin/customers:
 *   get:
 *     summary: Get list of customers (Admin gets all, Operator gets project-specific)
 *     description: |
 *       Returns a list of customers based on user role:
 *       - Admin: Returns all customers from all projects
 *       - Operator: Returns only customers from the operator's assigned project
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customer list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     customers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           userId:
 *                             type: integer
 *                           user:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               username:
 *                                 type: string
 *                               role:
 *                                 type: string
 *                                 example: "customer"
 *                               createdAt:
 *                                 type: string
 *                                 format: date-time
 *                               updatedAt:
 *                                 type: string
 *                                 format: date-time
 *                           firstName:
 *                             type: string
 *                           lastName:
 *                             type: string
 *                           email:
 *                             type: string
 *                           mobileNumber:
 *                             type: string
 *                           projectId:
 *                             type: integer
 *                           project:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               projectName:
 *                                 type: string
 *                               societyName:
 *                                 type: string
 *                           parkingSystemId:
 *                             type: integer
 *                             nullable: true
 *                           parkingSystem:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               wingName:
 *                                 type: string
 *                               type:
 *                                 type: string
 *                               level:
 *                                 type: integer
 *                               column:
 *                                 type: integer
 *                           flatNumber:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [Approved, Rejected, Pending]
 *                           approvedBy:
 *                             type: integer
 *                             nullable: true
 *                           approvedAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     count:
 *                       type: integer
 *                       description: Total number of customers
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Admin or Operator access required
 *       404:
 *         description: Operator profile not found or operator not assigned to any project
 *       500:
 *         description: Server error
 */
router.get('/customers', authorize('admin', 'operator'), customerController.getCustomerList);

/**
 * @swagger
 * /api/admin/customers-with-cars:
 *   post:
 *     summary: Get customers with their cars filtered by project IDs (Admin only)
 *     description: Returns all customers with their associated cars for the specified project IDs. Only accessible by admins.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectIds
 *             properties:
 *               projectIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                   minimum: 1
 *                 description: Array of project IDs to filter customers
 *                 example: [1, 2, 3]
 *                 minItems: 1
 *     responses:
 *       200:
 *         description: Customers with cars retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     customers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           userId:
 *                             type: integer
 *                           user:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               username:
 *                                 type: string
 *                               role:
 *                                 type: string
 *                               createdAt:
 *                                 type: string
 *                                 format: date-time
 *                               updatedAt:
 *                                 type: string
 *                                 format: date-time
 *                           firstName:
 *                             type: string
 *                           lastName:
 *                             type: string
 *                           email:
 *                             type: string
 *                           mobileNumber:
 *                             type: string
 *                           projectId:
 *                             type: integer
 *                           project:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               projectName:
 *                                 type: string
 *                               societyName:
 *                                 type: string
 *                           parkingSystemId:
 *                             type: integer
 *                             nullable: true
 *                           parkingSystem:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               wingName:
 *                                 type: string
 *                               type:
 *                                 type: string
 *                                 enum: [Tower, Puzzle]
 *                               level:
 *                                 type: integer
 *                               levelBelowGround:
 *                                 type: integer
 *                                 nullable: true
 *                               column:
 *                                 type: integer
 *                           palletAllotmentId:
 *                             type: integer
 *                             nullable: true
 *                           flatNumber:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [Approved, Rejected, Pending]
 *                           approvedBy:
 *                             type: integer
 *                             nullable: true
 *                           approvedAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                           cars:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                 userId:
 *                                   type: integer
 *                                 carType:
 *                                   type: string
 *                                 carModel:
 *                                   type: string
 *                                 carCompany:
 *                                   type: string
 *                                 carNumber:
 *                                   type: string
 *                                 createdAt:
 *                                   type: string
 *                                   format: date-time
 *                                 updatedAt:
 *                                   type: string
 *                                   format: date-time
 *                     count:
 *                       type: integer
 *                       description: Total number of customers
 *       400:
 *         description: Validation error - Project IDs array is required or invalid
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.post('/customers-with-cars', authorize('admin'), customerController.getCustomersWithCarsByProjectIds);

/**
 * @swagger
 * /api/admin/create-parking-system:
 *   post:
 *     summary: Create a new parking system with pallet details (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectName
 *               - societyName
 *               - type
 *               - level
 *               - column
 *             properties:
 *               projectName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 150
 *                 example: "Green Valley Apartments"
 *               societyName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 150
 *                 example: "Green Valley Society"
 *               wingName:
 *                 type: string
 *                 maxLength: 100
 *                 example: "Wing A"
 *               type:
 *                 type: string
 *                 enum: [Tower, Puzzle]
 *                 example: "Tower"
 *               level:
 *                 type: integer
 *                 minimum: 1
 *                 description: Level above ground (used for both Tower and Puzzle)
 *                 example: 3
 *               levelBelowGround:
 *                 type: integer
 *                 minimum: 0
 *                 description: Level below ground (required for Puzzle, should not be provided for Tower)
 *                 example: 3
 *               column:
 *                 type: integer
 *                 minimum: 1
 *                 example: 2
 *               timeForEachLevel:
 *                 type: integer
 *                 minimum: 0
 *                 example: 30
 *               timeForHorizontalMove:
 *                 type: integer
 *                 minimum: 0
 *                 example: 10
 *               bufferTime:
 *                 type: integer
 *                 minimum: 0
 *                 description: Buffer time in seconds
 *                 example: 5
 *     responses:
 *       201:
 *         description: Parking system created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     parkingSystem:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         wingName:
 *                           type: string
 *                         projectId:
 *                           type: integer
 *                         type:
 *                           type: string
 *                         level:
 *                           type: integer
 *                         levelBelowGround:
 *                           type: integer
 *                           nullable: true
 *                           description: Level below ground (NULL for Tower)
 *                         column:
 *                           type: integer
 *                         totalNumberOfPallet:
 *                           type: integer
 *                           description: Calculated as Level × Column for Tower, or ((Column-1) × Level) + 1 + (Column × LevelBelowGround) for Puzzle
 *                         timeForEachLevel:
 *                           type: integer
 *                         timeForHorizontalMove:
 *                           type: integer
 *                         bufferTime:
 *                           type: integer
 *                           description: Buffer time in seconds
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     project:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         projectName:
 *                           type: string
 *                         societyName:
 *                           type: string
 *       400:
 *         description: Validation error or project name already exists
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.post('/create-parking-system', authorize('admin'), validateCreateParkingSystem, parkingSystemController.createParkingSystem);

/**
 * @swagger
 * /api/admin/generate-pallets:
 *   post:
 *     summary: Generate pallets for a parking system (Admin only)
 *     description: |
 *       Automatically generates pallets for a parking system based on its configuration. Pallets will be numbered starting from the provided starting pallet number.
 *       **Tower:** numbers increase **column-major** (column 1 — all levels 1…N, then column 2 — all levels, etc.).
 *       **Puzzle:** unchanged from existing layout logic.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - parkingSystemId
 *               - startingPalletNumber
 *             properties:
 *               parkingSystemId:
 *                 type: integer
 *                 minimum: 1
 *                 description: Parking System ID
 *                 example: 1
 *               startingPalletNumber:
 *                 type: integer
 *                 minimum: 1
 *                 description: Starting pallet number for UserGivenPalletNumber
 *                 example: 1
 *     responses:
 *       201:
 *         description: Pallets generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     parkingSystem:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         wingName:
 *                           type: string
 *                         projectId:
 *                           type: integer
 *                         type:
 *                           type: string
 *                         level:
 *                           type: integer
 *                         levelBelowGround:
 *                           type: integer
 *                           nullable: true
 *                         column:
 *                           type: integer
 *                         totalNumberOfPallet:
 *                           type: integer
 *                     palletDetails:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           level:
 *                             type: integer
 *                             nullable: true
 *                           levelBelowGround:
 *                             type: integer
 *                             nullable: true
 *                           column:
 *                             type: integer
 *                           userGivenPalletNumber:
 *                             type: string
 *                     totalPalletsCreated:
 *                       type: integer
 *                     startingPalletNumber:
 *                       type: integer
 *                     endingPalletNumber:
 *                       type: integer
 *       400:
 *         description: Validation error, parking system not found, or pallets already exist
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.post('/generate-pallets', authorize('admin'), parkingSystemController.generatePallets);

/**
 * @swagger
 * /api/admin/bulk-update-pallet-numbers:
 *   post:
 *     summary: Bulk set user-facing pallet labels by floor and column (Admin and Operator)
 *     description: |
 *       For each entry, finds the pallet in `PalletDetails` for the given `parkingSystemId` where
 *       `Column` = `floorColumn`, and `floor` matches either above-ground `Level` (LevelBelowGround null)
 *       or below-ground `LevelBelowGround` (Level null), same as operator car-in. Sets `UserGivenPalletNumber` to `PalletNumber`.
 *       **Operator:** every `parkingSystemId` must be their assigned parking system; other ids are returned in `errors`.
 *       Duplicate (parkingSystemId, floor, floorColumn) in one request returns 400.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: array
 *                 items:
 *                   type: object
 *                   required: [ parkingSystemId, floor, floorColumn, PalletNumber ]
 *                   properties:
 *                     parkingSystemId: { type: integer, minimum: 1 }
 *                     floor: { type: integer, minimum: 1, description: Matches Level or LevelBelowGround }
 *                     floorColumn: { type: integer, minimum: 1 }
 *                     PalletNumber: { type: string, description: Stored in UserGivenPalletNumber }
 *               - type: object
 *                 required: [ items ]
 *                 properties:
 *                   items:
 *                     type: array
 *                     items:
 *                       type: object
 *                       required: [ parkingSystemId, floor, floorColumn, PalletNumber ]
 *                       properties:
 *                         parkingSystemId: { type: integer }
 *                         floor: { type: integer }
 *                         floorColumn: { type: integer }
 *                         PalletNumber: { type: string }
 *     responses:
 *       200:
 *         description: Result lists updated rows and any rows that could not be matched
 *       400:
 *         description: Validation error or duplicate slots in request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin or Operator access required
 */
router.post(
  '/bulk-update-pallet-numbers',
  authorize('admin', 'operator'),
  validateBulkUpdatePalletNumbers,
  parkingSystemController.bulkUpdateUserGivenPalletNumbers
);

/**
 * @swagger
 * /api/admin/pallet-details:
 *   get:
 *     summary: Get all pallet details for a specific project and parking system (Admin and Operator)
 *     description: Returns all pallet details including car information for the specified project and parking system.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Project ID
 *         example: 1
 *       - in: query
 *         name: parkingSystemId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Parking System ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Pallet details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     project:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         projectName:
 *                           type: string
 *                         societyName:
 *                           type: string
 *                     parkingSystem:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         wingName:
 *                           type: string
 *                         projectId:
 *                           type: integer
 *                         type:
 *                           type: string
 *                           enum: [Tower, Puzzle]
 *                         level:
 *                           type: integer
 *                         column:
 *                           type: integer
 *                         totalNumberOfPallet:
 *                           type: integer
 *                         timeForEachLevel:
 *                           type: integer
 *                         timeForHorizontalMove:
 *                           type: integer
 *                     palletDetails:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           userId:
 *                             type: integer
 *                           projectId:
 *                             type: integer
 *                           parkingSystemId:
 *                             type: integer
 *                           level:
 *                             type: integer
 *                           column:
 *                             type: integer
 *                           userGivenPalletNumber:
 *                             type: string
 *                           carId:
 *                             type: integer
 *                             nullable: true
 *                           car:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               carType:
 *                                 type: string
 *                               carModel:
 *                                 type: string
 *                               carCompany:
 *                                 type: string
 *                               carNumber:
 *                                 type: string
 *                               user:
 *                                 type: object
 *                                 nullable: true
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                   username:
 *                                     type: string
 *                           status:
 *                             type: string
 *                             enum: [Assigned, Released]
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     count:
 *                       type: integer
 *                       description: Total number of pallets
 *       400:
 *         description: Project ID and Parking System ID are required
 *       404:
 *         description: Project or parking system not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin or Operator access required
 */
router.get('/pallet-details', authorize('admin', 'operator'), parkingSystemController.getPalletDetails);

/**
 * @swagger
 * /api/admin/update-operator-pallet-power:
 *   put:
 *     summary: Update operator's pallet power permission (Admin only)
 *     description: Updates the HasPalletPower field for an operator to enable or disable their pallet management capabilities.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - operatorId
 *               - hasPalletPower
 *             properties:
 *               operatorId:
 *                 type: integer
 *                 minimum: 1
 *                 description: The ID of the operator to update
 *                 example: 1
 *               hasPalletPower:
 *                 type: boolean
 *                 description: Whether the operator should have pallet power permission
 *                 example: true
 *     responses:
 *       200:
 *         description: Operator pallet power updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     operator:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         userId:
 *                           type: integer
 *                         user:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                             username:
 *                               type: string
 *                             role:
 *                               type: string
 *                         firstName:
 *                           type: string
 *                         lastName:
 *                           type: string
 *                         email:
 *                           type: string
 *                         mobileNumber:
 *                           type: string
 *                         projectId:
 *                           type: integer
 *                         project:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             id:
 *                               type: integer
 *                             projectName:
 *                               type: string
 *                             societyName:
 *                               type: string
 *                         parkingSystemId:
 *                           type: integer
 *                           nullable: true
 *                         parkingSystem:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             id:
 *                               type: integer
 *                             wingName:
 *                               type: string
 *                             type:
 *                               type: string
 *                             level:
 *                               type: integer
 *                             column:
 *                               type: integer
 *                         status:
 *                           type: string
 *                           enum: [Approved, Rejected, Pending]
 *                         hasPalletPower:
 *                           type: boolean
 *                         approvedBy:
 *                           type: integer
 *                           nullable: true
 *                         approvedAt:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error - Invalid operatorId or hasPalletPower value
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Operator not found
 *       500:
 *         description: Server error
 */
router.put('/update-operator-pallet-power', authorize('admin'), validateUpdatePalletPower, operatorController.updateOperatorPalletPower);

module.exports = router;

