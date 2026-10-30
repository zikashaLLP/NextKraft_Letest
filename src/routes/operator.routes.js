const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const operatorController = require('../controllers/operator.controller');
const parkingSystemController = require('../controllers/parkingSystem.controller');
const parkingRequestController = require('../controllers/parkingRequest.controller');
const { validateCreateOperator } = require('../validators/operator.validator');
const { validateCarIn, validateParkCar, validateUpdateRequestStatus, validateCallEmptyPallet, validateUpdateParkingSystemStatus, validateReleaseParkedCar, validateCarOut, validateCallSpecificPallet, validateCallPalletAndCreateRequest, validateCallPalletByCarNumber } = require('../validators/pallet.validator');
const { validateParkingSync } = require('../validators/parkingSync.validator');
const { validateBulkUpdatePalletNumbers } = require('../validators/parkingSystem.validator');

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/operator:
 *   post:
 *     summary: Create a new operator with full profile (Admin only)
 *     description: This endpoint is accessible to admins only. Creates both User and Operator records.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *               - firstName
 *               - projectId
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 example: "operator_01"
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: "password123"
 *               firstName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 example: "John"
 *               lastName:
 *                 type: string
 *                 maxLength: 100
 *                 example: "Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 maxLength: 150
 *                 example: "john.doe@example.com"
 *               mobileNumber:
 *                 type: string
 *                 maxLength: 20
 *                 example: "+919876543210"
 *               projectId:
 *                 type: integer
 *                 minimum: 1
 *                 example: 1
 *               parkingSystemId:
 *                 type: integer
 *                 minimum: 1
 *                 example: 1
 *     responses:
 *       201:
 *         description: Operator created successfully
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
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         username:
 *                           type: string
 *                         role:
 *                           type: string
 *                           example: "operator"
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     operator:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         userId:
 *                           type: integer
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
 *                         parkingSystemId:
 *                           type: integer
 *                         status:
 *                           type: string
 *                           enum: [Approved, Rejected, Pending]
 *                         approvedBy:
 *                           type: integer
 *                         approvedAt:
 *                           type: string
 *                           format: date-time
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error or username already exists
 *       404:
 *         description: Project or parking system not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.post('/', authorize('admin'), validateCreateOperator, operatorController.createOperator);

/**
 * @swagger
 * /api/operator/list:
 *   get:
 *     summary: Get list of all operators (Admin only)
 *     description: Returns a list of all operators with their user, project, and parking system details.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Operator list retrieved successfully
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
 *                     operators:
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
 *                                 example: "operator"
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
 *                           status:
 *                             type: string
 *                             enum: [Approved, Rejected, Pending]
 *                           hasPalletPower:
 *                             type: boolean
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
 *                       description: Total number of operators
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.get('/list', authorize('admin'), operatorController.getOperatorList);

/**
 * @swagger
 * /api/operator/profile:
 *   get:
 *     summary: Get current operator profile (Authentication required)
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Operator profile retrieved successfully
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
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         username:
 *                           type: string
 *                         role:
 *                           type: string
 *                           example: "operator"
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     operator:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         userId:
 *                           type: integer
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
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Operator access required
 *       404:
 *         description: Operator profile not found
 */
router.get('/profile', authorize('operator'), operatorController.getOperatorProfile);

/**
 * @swagger
 * /api/operator/project:
 *   get:
 *     summary: Get operator's assigned project and its parking systems (Operator only)
 *     description: Returns the project assigned to the operator and all parking systems for that project with basic details (no pallet details).
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Project and parking systems retrieved successfully
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
 *                     parkingSystems:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           wingName:
 *                             type: string
 *                           projectId:
 *                             type: integer
 *                           type:
 *                             type: string
 *                             enum: [Tower, Puzzle]
 *                           level:
 *                             type: integer
 *                           column:
 *                             type: integer
 *                           totalNumberOfPallet:
 *                             type: integer
 *                           timeForEachLevel:
 *                             type: integer
 *                           timeForHorizontalMove:
 *                             type: integer
 *                           bufferTime:
 *                             type: integer
 *                             description: Buffer time in seconds
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     count:
 *                       type: integer
 *                       description: Total number of parking systems
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Operator access required
 *       404:
 *         description: Operator profile not found or operator not assigned to any project
 */
router.get('/project', authorize('operator'), operatorController.getOperatorProjectWithParkingSystems);

/**
 * @swagger
 * /api/operator/customers-with-cars:
 *   get:
 *     summary: Get customers (with cars) for operator's project and parking system (Operator only)
 *     description: Returns customers filtered to the authenticated operator's project and parking system, including their car details.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customers retrieved successfully
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
 *                           parkingSystemId:
 *                             type: integer
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
 *                       description: Total number of customers returned
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Operator access required
 *       404:
 *         description: Operator profile not found or not assigned to project/parking system
 */
router.get('/customers-with-cars', authorize('operator'), operatorController.getOperatorCustomersWithCars);

/**
 * @swagger
 * /api/operator/parking-requests:
 *   get:
 *     summary: Get parking requests assigned to the operator
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Parking requests retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Operator access required
 *       404:
 *         description: Operator profile not found
 */
router.get('/parking-requests', authorize('operator'), parkingRequestController.getOperatorParkingRequests);

/**
 * @swagger
 * /api/operator/parking-requests/{requestId}/status:
 *   put:
 *     summary: Update parking request status (Operator or Customer)
 *     description: |
 *       Shared status API for parking requests.
 *       - **Operator**: can transition within project/parking-system scope (Accepted, Queued, Completed, Cancelled, etc.).
 *       - **Customer**: can only set `Cancelled`, and only while the request is **Pending** and owned by them.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Parking request ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [Pending, Accepted, Queued, Completed, Cancelled]
 *                 example: Cancelled
 *           examples:
 *             operatorAccept:
 *               summary: Operator accepts request
 *               value:
 *                 status: Accepted
 *             customerCancelPending:
 *               summary: Customer cancels pending request
 *               value:
 *                 status: Cancelled
 *     responses:
 *       200:
 *         description: Parking request status updated successfully
 *       400:
 *         description: Invalid status transition or customer tried a non-pending cancel
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Operator or Customer access required
 *       404:
 *         description: Operator/customer or parking request not found
 */
router.put(
  '/parking-requests/:requestId/status',
  authorize('operator', 'customer'),
  parkingRequestController.updateParkingRequestStatus
);

/**
 * @swagger
 * /api/operator/customer/status:
 *   post:
 *     summary: Update customer status (Operator)
 *     description: Operator updates a customer's status (Approved or Rejected) for customers that belong to their project.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: customerId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Customer ID to update status
 *         example: 12
 *       - in: query
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [Approved, Rejected]
 *         description: Status to set for the customer (Approved or Rejected)
 *         example: Approved
 *     responses:
 *       200:
 *         description: Customer status updated successfully
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
 *                     id:
 *                       type: integer
 *                     userId:
 *                       type: integer
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     email:
 *                       type: string
 *                     mobileNumber:
 *                       type: string
 *                     projectId:
 *                       type: integer
 *                     parkingSystemId:
 *                       type: integer
 *                     status:
 *                       type: string
 *                       enum: [Approved, Rejected, Pending]
 *                     approvedBy:
 *                       type: integer
 *                     approvedAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid status, missing parameters, or customer does not belong to the same project as the operator
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Operator access required
 *       404:
 *         description: Operator or customer not found
 */
router.post('/customer/status', authorize('operator'), operatorController.updateCustomerStatus);

/**
 * @swagger
 * /api/operator/pallet-details:
 *   get:
 *     summary: Get all pallet details for a specific project and parking system (Admin and Operator)
 *     description: Returns all pallet details including car information for the specified project and parking system.
 *     tags: [Operator]
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
 *                         bufferTime:
 *                           type: integer
 *                           description: Buffer time in seconds
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
 * /api/operator/bulk-update-pallet-numbers:
 *   post:
 *     summary: Bulk set user-facing pallet labels (Operator only)
 *     description: Same as POST /api/admin/bulk-update-pallet-numbers; rows must use your assigned parkingSystemId.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *     responses:
 *       200:
 *         description: Same shape as admin bulk-update (updated / errors)
 */
router.post(
  '/bulk-update-pallet-numbers',
  authorize('operator'),
  validateBulkUpdatePalletNumbers,
  parkingSystemController.bulkUpdateUserGivenPalletNumbers
);

/**
 * @swagger
 * /api/operator/car-in:
 *   post:
 *     summary: Car in (Operator only)
 *     description: |
 *       Accepts the parking request (Accepted). Slot assignment (UserId/CarId on pallet) happens in POST /api/operator/park-car.
 *       Pallet is resolved by floor + floorColumn within the operator's parking system (Level/Column above ground, or LevelBelowGround/Column below ground).
 *       Either parkingRequestId or carNumber. When using carNumber, send exactly 4 digits (last 4 of plate); lookup matches retrieve — scoped to this project + parking system. If no match, dummy user/car creation runs as before.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - floor
 *               - floorColumn
 *             properties:
 *               floor:
 *                 type: integer
 *                 minimum: 1
 *                 description: Above ground matches Level; below ground (Puzzle) matches LevelBelowGround when Level is null
 *               floorColumn:
 *                 type: integer
 *                 minimum: 1
 *                 description: Column number for this parking system
 *               parkingRequestId:
 *                 type: integer
 *                 minimum: 1
 *               carNumber:
 *                 type: string
 *                 pattern: '^\\d{4}$'
 *                 description: Last 4 digits of plate (same matching rules as POST call-pallet-by-car-number)
 *                 example: "1234"
 *     responses:
 *       200:
 *         description: Returns parkingRequestId and resolved palletId
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
 *                     parkingRequestId:
 *                       type: integer
 *                     palletId:
 *                       type: integer
 *       400:
 *         description: Validation error
 *       404:
 *         description: Not found
 */
router.post('/car-in', authorize('operator'), validateCarIn, operatorController.carIn);

/**
 * @swagger
 * /api/operator/park-car:
 *   post:
 *     summary: Park car — assign pallet and complete parking request (Operator only)
 *     description: |
 *       Assigns the pallet slot: UserId, CarId (from parking request car), Status Assigned on PalletDetails. CarType on pallet is not set.
 *       Sets parking request to Completed and sends pallet_assigned notification/WebSocket.
 *       Parking request must be Accepted (after car-in). Requires palletId for the slot being used.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - parkingRequestId
 *               - palletId
 *             properties:
 *               parkingRequestId:
 *                 type: integer
 *                 minimum: 1
 *               palletId:
 *                 type: integer
 *                 minimum: 1
 *               syncUuid:
 *                 type: string
 *                 maxLength: 64
 *                 description: Optional Omron CarAllotHistory SyncUuid for durable ledger + live ACK
 *     responses:
 *       200:
 *         description: Parking completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     parkingRequestId:
 *                       type: integer
 *                     palletId:
 *                       type: integer
 *                     status:
 *                       type: string
 *                       example: Completed
 *                     syncUuid:
 *                       type: string
 *                       nullable: true
 */
router.post('/park-car', authorize('operator'), validateParkCar, operatorController.parkCar);

/**
 * @swagger
 * /api/operator/requests:
 *   get:
 *     summary: Get list of requests assigned to the operator (Operator only)
 *     description: Returns all requests assigned to the authenticated operator, ordered by status (Pending first) and creation date.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Operator requests retrieved successfully
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
 *                     requests:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           userId:
 *                             type: integer
 *                           customer:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               username:
 *                                 type: string
 *                               role:
 *                                 type: string
 *                           palletAllotmentId:
 *                             type: integer
 *                           pallet:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               level:
 *                                 type: integer
 *                               column:
 *                                 type: integer
 *                               userGivenPalletNumber:
 *                                 type: string
 *                               status:
 *                                 type: string
 *                                 enum: [Assigned, Released]
 *                               car:
 *                                 type: object
 *                                 nullable: true
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                   carType:
 *                                     type: string
 *                                   carModel:
 *                                     type: string
 *                                   carCompany:
 *                                     type: string
 *                                   carNumber:
 *                                     type: string
 *                                   user:
 *                                     type: object
 *                                     nullable: true
 *                                     properties:
 *                                       id:
 *                                         type: integer
 *                                       username:
 *                                         type: string
 *                               parkingSystem:
 *                                 type: object
 *                                 nullable: true
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                   wingName:
 *                                     type: string
 *                                   type:
 *                                     type: string
 *                                     enum: [Tower, Puzzle]
 *                                   level:
 *                                     type: integer
 *                                   column:
 *                                     type: integer
 *                               project:
 *                                 type: object
 *                                 nullable: true
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                   projectName:
 *                                     type: string
 *                                   societyName:
 *                                     type: string
 *                           projectId:
 *                             type: integer
 *                           parkingSystemId:
 *                             type: integer
 *                           carId:
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
 *                           status:
 *                             type: string
 *                             enum: [Pending, Accepted, Queued, Completed, Cancelled]
 *                           estimatedTime:
 *                             type: integer
 *                             description: Estimated time in seconds
 *                           estimatedTimeFormatted:
 *                             type: string
 *                             description: Estimated time in human-readable format
 *                             example: "5 minutes 30 seconds"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     count:
 *                       type: integer
 *                       description: Total number of requests
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Operator access required
 *       404:
 *         description: Operator profile not found
 */
router.get('/requests', authorize('operator'), operatorController.getOperatorRequests);

/**
 * @swagger
 * /api/operator/requests/{requestId}/status:
 *   put:
 *     summary: Update release request status (Operator or Customer)
 *     description: |
 *       Shared status API for release (retrieve) requests.
 *       - **Operator**: full transitions in their project/parking-system scope. `Completed` releases the pallet and moves the row to request history.
 *       - **Customer**: can only set `Cancelled`, and only while the request is **Pending** and owned by them.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Request ID
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [Pending, Accepted, Queued, Completed, Cancelled]
 *                 description: New status for the request
 *                 example: "Cancelled"
 *           examples:
 *             operatorComplete:
 *               summary: Operator completes release
 *               value:
 *                 status: Completed
 *             customerCancelPending:
 *               summary: Customer cancels pending release
 *               value:
 *                 status: Cancelled
 *     responses:
 *       200:
 *         description: Request status updated successfully
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
 *                     request:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         userId:
 *                           type: integer
 *                         customer:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             id:
 *                               type: integer
 *                             username:
 *                               type: string
 *                             role:
 *                               type: string
 *                         palletAllotmentId:
 *                           type: integer
 *                         pallet:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             id:
 *                               type: integer
 *                             userId:
 *                               type: integer
 *                             carId:
 *                               type: integer
 *                               nullable: true
 *                             level:
 *                               type: integer
 *                             column:
 *                               type: integer
 *                             userGivenPalletNumber:
 *                               type: string
 *                             status:
 *                               type: string
 *                               enum: [Assigned, Released]
 *                             car:
 *                               type: object
 *                               nullable: true
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                 carType:
 *                                   type: string
 *                                 carModel:
 *                                   type: string
 *                                 carCompany:
 *                                   type: string
 *                                 carNumber:
 *                                   type: string
 *                             parkingSystem:
 *                               type: object
 *                               nullable: true
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                 wingName:
 *                                   type: string
 *                                 type:
 *                                   type: string
 *                                   enum: [Tower, Puzzle]
 *                                 level:
 *                                   type: integer
 *                                 column:
 *                                   type: integer
 *                             project:
 *                               type: object
 *                               nullable: true
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                 projectName:
 *                                   type: string
 *                                 societyName:
 *                                   type: string
 *                         projectId:
 *                           type: integer
 *                         parkingSystemId:
 *                           type: integer
 *                         carId:
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
 *                         car:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             id:
 *                               type: integer
 *                             carType:
 *                               type: string
 *                             carModel:
 *                               type: string
 *                             carCompany:
 *                               type: string
 *                             carNumber:
 *                               type: string
 *                         status:
 *                           type: string
 *                           enum: [Pending, Accepted, Queued, Completed, Cancelled]
 *                         estimatedTime:
 *                           type: integer
 *                         estimatedTimeFormatted:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     message:
 *                       type: string
 *       400:
 *         description: Validation error, invalid status transition, or customer tried a non-pending cancel
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Operator or Customer access required
 *       404:
 *         description: Request not found or not assigned to actor
 */
router.put(
  '/requests/:requestId/status',
  authorize('operator', 'customer'),
  validateUpdateRequestStatus,
  operatorController.updateRequestStatus
);

/**
 * @swagger
 * /api/operator/call-empty-pallet:
 *   post:
 *     summary: Call empty pallet (Operator only)
 *     description: |
 *       For Tower parking: Finds the lowest empty pallet that fits the requested car type (pallet CarType matches or is unset).
 *       For Puzzle parking: Calls the customer's assigned pallet (customerId required). carType is optional for Puzzle.
 *       Returns pallet information and calculated time to call the empty pallet.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               carType:
 *                 type: string
 *                 enum: [Sedan, SUV]
 *                 description: Required for Tower — picks lowest empty pallet for this type (pallet CarType matches or is null).
 *                 example: Sedan
 *               customerId:
 *                 type: integer
 *                 minimum: 1
 *                 description: Required for Puzzle parking system. Optional for Tower.
 *                 example: 1
 *     responses:
 *       200:
 *         description: Empty pallet called successfully
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
 *                     palletId:
 *                       type: integer
 *                       description: ID of the pallet
 *                     palletNumber:
 *                       type: string
 *                       description: User-given pallet number
 *                     carType:
 *                       type: string
 *                       enum: [Sedan, SUV]
 *                       nullable: true
 *                       description: Pallet slot car type (null if generic)
 *                     level:
 *                       type: integer
 *                       nullable: true
 *                       description: Level above ground
 *                     levelBelowGround:
 *                       type: integer
 *                       nullable: true
 *                       description: Level below ground (for Puzzle only)
 *                     column:
 *                       type: integer
 *                       description: Column number
 *                     timeToCall:
 *                       type: integer
 *                       description: Time to call empty pallet in seconds
 *                     timeToCallFormatted:
 *                       type: string
 *                       description: Time in human-readable format
 *                       example: "5 minutes 30 seconds"
 *                     parkingSystem:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         type:
 *                           type: string
 *                           enum: [Tower, Puzzle]
 *                         wingName:
 *                           type: string
 *                           nullable: true
 *       400:
 *         description: Validation error or invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Operator access required
 *       404:
 *         description: Operator profile not found, no empty pallet for this car type (Tower), or customer/pallet not found (Puzzle)
 */
router.post('/call-empty-pallet', authorize('operator'), validateCallEmptyPallet, operatorController.callEmptyPallet);

/**
 * @swagger
 * /api/operator/car-out:
 *   post:
 *     summary: Car out — unified operator retrieve (Operator only)
 *     description: |
 *       Single endpoint replacing call-specific-pallet, call-pallet-create-request (by pallet), and call-pallet-by-car-number for the accept/create flow.
 *       Send exactly one of **carNumber** (4 digits, last 4 of plate) or **requestId**.
 *       Optional **currentFloor**: live lift floor from PLC FLOOR_COUNTER (0=GF, 1=TT, 2→1F, …).
 *       Optional **palletFloor**: Transporter_Pallet_Floor mapped the same way; 0/1→0 (no pallet on lift).
 *       Optional **tt**: target-floor TT register value from Omron FloorMapping (PLC poll).
 *       Used for Tower release ETA:
 *       CURRENT → (optional PARKED_PALLET) → TARGET → GROUND.
 *       - **requestId**: Accept a pending/queued release request for this operator scope; if already Accepted, returns the same id.
 *       - **carNumber**: Resolve car by last 4 within project + parking system; if an open request exists it is accepted; otherwise a new request is created and accepted (same as call-pallet-by-car-number).
 *       Response **data** contains only **requestId**. Use it with POST /api/operator/release-parked-car when the car has left the pallet.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               carNumber:
 *                 type: string
 *                 pattern: '^\\d{4}$'
 *                 example: "1234"
 *               requestId:
 *                 type: integer
 *                 minimum: 1
 *                 example: 42
 *               currentFloor:
 *                 type: integer
 *                 minimum: 0
 *                 description: Live lift floor from FLOOR_COUNTER (0=GF, 1=TT, 2→1F mapped as 1)
 *                 example: 2
 *               palletFloor:
 *                 type: integer
 *                 minimum: 0
 *                 description: Transporter_Pallet_Floor mapped same way; 0 means no pallet on lift
 *                 example: 0
 *               tt:
 *                 type: integer
 *                 description: |
 *                   Target-floor TT from Omron FloorMapping. Tower ETA additives:
 *                   11 → +45s side; 10 → no side add.
 *                 example: 11
 *               w310:
 *                 type: integer
 *                 enum: [0, 1]
 *                 description: |
 *                   W3.10 TT CC Stop. Extra TT (+45s) only when pallet on lift
 *                   AND w310=0 AND w313=1.
 *                 example: 0
 *               w313:
 *                 type: integer
 *                 enum: [0, 1]
 *                 description: W3.13 CC Wise Stop. With pallet on lift and w310=0, w313=1 adds Extra TT.
 *                 example: 1
 *     responses:
 *       200:
 *         description: Returns only requestId in data
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
 *                     requestId:
 *                       type: integer
 *       400:
 *         description: Validation error or invalid request state
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Operator access required
 *       404:
 *         description: Not found
 */
router.post('/car-out', authorize('operator'), validateCarOut, operatorController.carOut);

/**
 * @swagger
 * /api/operator/call-specific-pallet:
 *   post:
 *     summary: Call specific pallet and accept request (Operator only)
 *     description: |
 *       Calls a specific pallet by palletId and accepts the associated request (changes status to 'Accepted').
 *       Calculates the time it will take to move the pallet to ground level (same calculation as callEmptyPallet).
 *       Sends notification to the customer.
 *       To update persisted parking system status (and notify customers via WebSocket), use PUT /api/operator/parking-system/status.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - palletId
 *               - requestId
 *             properties:
 *               palletId:
 *                 type: integer
 *                 minimum: 1
 *                 description: ID of the pallet to call
 *                 example: 123
 *               requestId:
 *                 type: integer
 *                 minimum: 1
 *                 description: ID of the request to accept
 *                 example: 456
 *     responses:
 *       200:
 *         description: Specific pallet called and request accepted successfully
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
 *                     palletId:
 *                       type: integer
 *                       description: ID of the pallet
 *                     palletNumber:
 *                       type: string
 *                       description: User-given pallet number
 *                     level:
 *                       type: integer
 *                       nullable: true
 *                       description: Level above ground
 *                     levelBelowGround:
 *                       type: integer
 *                       nullable: true
 *                       description: Level below ground (for Puzzle only)
 *                     column:
 *                       type: integer
 *                       description: Column number
 *                     timeToCall:
 *                       type: integer
 *                       description: Time to call pallet to ground in seconds
 *                     timeToCallFormatted:
 *                       type: string
 *                       description: Time in human-readable format
 *                       example: "5 minutes 30 seconds"
 *                     request:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         status:
 *                           type: string
 *                           enum: [Accepted]
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     parkingSystem:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         type:
 *                           type: string
 *                           enum: [Tower, Puzzle]
 *                         wingName:
 *                           type: string
 *                           nullable: true
 *       400:
 *         description: Validation error, invalid request status, or pallet does not belong to operator's parking system
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Operator access required
 *       404:
 *         description: Operator profile not found, pallet not found, or request not found
 */
router.post('/call-specific-pallet', authorize('operator'), validateCallSpecificPallet, operatorController.callSpecificPallet);

/**
 * @swagger
 * /api/operator/call-pallet-create-request:
 *   post:
 *     summary: Call pallet and create release request (Operator only)
 *     description: |
 *       Calls a specific pallet by palletId when there's no existing request for the customer.
 *       This will:
 *       - Validate the pallet is assigned to a customer and car
 *       - Check if a request already exists (if yes, throws error)
 *       - Create a new release request with status 'Pending'
 *       - Immediately update request status to 'Accepted'
 *       - Calculate time to move pallet to ground level
 *       - Send notification to customer with estimated time
 *       Parking system status is updated only via PUT /api/operator/parking-system/status.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - palletId
 *             properties:
 *               palletId:
 *                 type: integer
 *                 minimum: 1
 *                 description: ID of the pallet to call
 *                 example: 123
 *     responses:
 *       200:
 *         description: Pallet called and request created successfully
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
 *                     palletId:
 *                       type: integer
 *                       description: ID of the pallet
 *                     palletNumber:
 *                       type: string
 *                       description: User-given pallet number
 *                     level:
 *                       type: integer
 *                       nullable: true
 *                       description: Level above ground
 *                     levelBelowGround:
 *                       type: integer
 *                       nullable: true
 *                       description: Level below ground (for Puzzle only)
 *                     column:
 *                       type: integer
 *                       description: Column number
 *                     timeToCall:
 *                       type: integer
 *                       description: Time to call pallet to ground in seconds
 *                     timeToCallFormatted:
 *                       type: string
 *                       description: Time in human-readable format
 *                       example: "5 minutes 30 seconds"
 *                     request:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         status:
 *                           type: string
 *                           enum: [Accepted]
 *                         estimatedTime:
 *                           type: integer
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     customer:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: integer
 *                         userId:
 *                           type: integer
 *                         firstName:
 *                           type: string
 *                         lastName:
 *                           type: string
 *                     car:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: integer
 *                         carType:
 *                           type: string
 *                         carModel:
 *                           type: string
 *                         carCompany:
 *                           type: string
 *                         carNumber:
 *                           type: string
 *                     parkingSystem:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         type:
 *                           type: string
 *                           enum: [Tower, Puzzle]
 *                         wingName:
 *                           type: string
 *                           nullable: true
 *       400:
 *         description: Validation error, pallet not assigned, request already exists, or pallet does not belong to operator's parking system
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Operator access required
 *       404:
 *         description: Operator profile not found, pallet not found, or customer not found
 */
router.post('/call-pallet-create-request', authorize('operator'), validateCallPalletAndCreateRequest, operatorController.callPalletAndCreateRequest);

/**
 * @swagger
 * /api/operator/call-pallet-by-car-number:
 *   post:
 *     summary: Call pallet by plate last 4 digits — car retrieve (Operator only)
 *     description: |
 *       Send `carNumber`: exactly 4 digits (last 4 of the plate).
 *       Matches cars only among customers of this operator's ProjectId and ParkingSystemId (plate suffix via RIGHT 4, spaces stripped).
 *       Requires exactly one such car; errors if none or multiple. Then finds that car parked (Assigned) on this project + parking system.
 *       Creates a release request. This will:
 *       - Resolve plate by last 4 digits within scope (not global LIKE search)
 *       - Check if the car is parked in operator's parking system
 *       - Check if a request already exists (if yes, throws error)
 *       - Create a new release request with status 'Pending'
 *       - Calculate time to move pallet to ground level
 *       - Send notification to customer with estimated time
 *       Parking system status is updated only via PUT /api/operator/parking-system/status.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - carNumber
 *             properties:
 *               carNumber:
 *                 type: string
 *                 pattern: '^\\d{4}$'
 *                 description: Exactly 4 digits — last 4 of plate (scoped to this project + parking system)
 *                 example: "1234"
 *     responses:
 *       200:
 *         description: Pallet called and request created successfully by car number
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
 *                     palletId:
 *                       type: integer
 *                       description: ID of the pallet
 *                     palletNumber:
 *                       type: string
 *                       description: User-given pallet number
 *                     level:
 *                       type: integer
 *                       nullable: true
 *                       description: Level above ground
 *                     levelBelowGround:
 *                       type: integer
 *                       nullable: true
 *                       description: Level below ground (for Puzzle only)
 *                     column:
 *                       type: integer
 *                       description: Column number
 *                     timeToCall:
 *                       type: integer
 *                       description: Time to call pallet to ground in seconds
 *                     timeToCallFormatted:
 *                       type: string
 *                       description: Time in human-readable format
 *                       example: "5 minutes 30 seconds"
 *                     request:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         status:
 *                           type: string
 *                           enum: [Pending]
 *                         estimatedTime:
 *                           type: integer
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     customer:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: integer
 *                         userId:
 *                           type: integer
 *                         firstName:
 *                           type: string
 *                         lastName:
 *                           type: string
 *                     car:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: integer
 *                         carType:
 *                           type: string
 *                         carModel:
 *                           type: string
 *                         carCompany:
 *                           type: string
 *                         carNumber:
 *                           type: string
 *                     parkingSystem:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         type:
 *                           type: string
 *                           enum: [Tower, Puzzle]
 *                         wingName:
 *                           type: string
 *                           nullable: true
 *       400:
 *         description: Validation error, multiple plate matches in scope, or request already exists
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Operator access required
 *       404:
 *         description: Operator profile not found, no car in scope, or car not parked in operator's parking system
 */
router.post('/call-pallet-by-car-number', authorize('operator'), validateCallPalletByCarNumber, operatorController.callPalletByCarNumber);

/**
 * @swagger
 * /api/operator/parking-system/status:
 *   put:
 *     summary: Update parking system status (Operator only)
 *     description: |
 *       Sets the parking system status. This is the only endpoint that persists parking system status in the database.
 *       Values map to physical states: Idle; LiftUp/LiftDown; LeftTaking, LeftLeaving, RightTaking, RightLeaving; turntable TT_0_180, TT_180_0; DoorOpen, DoorClose.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [Idle, LiftUp, LiftDown, LeftTaking, LeftLeaving, RightTaking, RightLeaving, TT_0_180, TT_180_0, DoorOpen, DoorClose]
 *                 description: New status for the parking system (must match model enum)
 *                 example: "LiftUp"
 *     responses:
 *       200:
 *         description: Parking system status updated successfully
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
 *                           nullable: true
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
 *                         status:
 *                           type: string
 *                           enum: [Idle, LiftUp, LiftDown, LeftTaking, LeftLeaving, RightTaking, RightLeaving, TT_0_180, TT_180_0, DoorOpen, DoorClose]
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error, invalid status, or operator not assigned to parking system
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Operator access required
 *       404:
 *         description: Operator profile not found
 */
router.put('/parking-system/status', authorize('operator'), validateUpdateParkingSystemStatus, operatorController.updateParkingSystemStatus);

/**
 * @swagger
 * /api/operator/release-parked-car:
 *   post:
 *     summary: Release parked car (Operator only)
 *     description: |
 *       Releases a parked car using the **release Request** id (from POST /api/operator/car-out or customer release flow).
 *       This will:
 *       - Load the active request by requestId for this operator's project + parking system
 *       - Set the request status to 'Completed'
 *       - Release the pallet (set UserId to 0, CarId to null, Status to 'Released')
 *       - Move the request to request_queue table as history
 *       - Delete the request from requests table
 *       - Send notification to the customer
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - requestId
 *             properties:
 *               requestId:
 *                 type: integer
 *                 minimum: 1
 *                 description: Active release request id (same as returned by car-out)
 *                 example: 456
 *               syncUuid:
 *                 type: string
 *                 maxLength: 64
 *                 description: Optional Omron CarAllotHistory SyncUuid for durable ledger + live ACK
 *     responses:
 *       200:
 *         description: Car released successfully
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
 *                     syncUuid:
 *                       type: string
 *                       nullable: true
 *                     pallet:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         userId:
 *                           type: integer
 *                           description: Will be 0 after release
 *                         projectId:
 *                           type: integer
 *                         parkingSystemId:
 *                           type: integer
 *                         level:
 *                           type: integer
 *                           nullable: true
 *                         levelBelowGround:
 *                           type: integer
 *                           nullable: true
 *                         column:
 *                           type: integer
 *                         userGivenPalletNumber:
 *                           type: string
 *                         carId:
 *                           type: integer
 *                           nullable: true
 *                           description: Will be null after release
 *                         status:
 *                           type: string
 *                           enum: [Released]
 *                           description: Will be 'Released' after release
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
 *                         type:
 *                           type: string
 *                           enum: [Tower, Puzzle]
 *                         level:
 *                           type: integer
 *                         column:
 *                           type: integer
 *                     project:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: integer
 *                         projectName:
 *                           type: string
 *                         societyName:
 *                           type: string
 *                     timeToCall:
 *                       type: integer
 *                       description: Time to move pallet to ground level in seconds
 *                     timeToCallFormatted:
 *                       type: string
 *                       description: Time in human-readable format
 *                       example: "5 minutes 30 seconds"
 *                     message:
 *                       type: string
 *                       description: Success message
 *       400:
 *         description: Validation error, pallet not assigned, or pallet does not belong to operator's parking system
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Operator access required
 *       404:
 *         description: Operator profile not found, pallet not found, or no active request for this requestId
 */
router.post('/release-parked-car', authorize('operator'), validateReleaseParkedCar, operatorController.releaseParkedCar);

/**
 * @swagger
 * /api/operator/parking-system-status:
 *   get:
 *     summary: Get parking system status (Operator only)
 *     description: Returns the status of the parking system assigned to the authenticated operator.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Parking system status retrieved successfully
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
 *                     status:
 *                       type: string
 *                       enum: [Idle, LiftUp, LiftDown, LeftTaking, LeftLeaving, RightTaking, RightLeaving, TT_0_180, TT_180_0, DoorOpen, DoorClose]
 *                       description: Current status of the parking system
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Operator access required
 *       404:
 *         description: Operator profile not found or not assigned to parking system
 */
router.get('/parking-system-status', authorize('operator'), parkingSystemController.getParkingSystemStatus);

/**
 * @swagger
 * /api/operator/parking-sync:
 *   post:
 *     summary: Sync PLC parking/retrieve history (Operator only)
 *     description: |
 *       Syncs local PLC car allot history into existing platform tables.
 *       Uses operator's assigned project and parking system from JWT context.
 *       Supports partial success: valid rows are applied while failed rows are returned.
 *       Retries are best-effort deduplicated by current database state.
 *       Duplicate rows in one request are skipped using row id when present, otherwise floorMapping.id+parkingTime+carNumber+retriveTime.
 *     tags: [Operator]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - carAllotHistory
 *             properties:
 *               carAllotHistory:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [floorMappingId, carNumber, parkingTime, floorMapping]
 *                   properties:
 *                     id:
 *                       type: integer
 *                       description: Optional client history row id; echoed as historyId in the response when present.
 *                     isParkingSync:
 *                       type: boolean
 *                       description: If true, parking side for this row is already synced on server.
 *                     isRetrivalSync:
 *                       type: boolean
 *                       description: If true, retrival side for this row is already synced on server.
 *                     carNumber:
 *                       type: string
 *                     parkingTime:
 *                       type: string
 *                       format: date-time
 *                     retriveTime:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     floorMapping:
 *                       type: object
 *                       required: [id, parkingSystemId, floor, floorColumn]
 *                       properties:
 *                         id:
 *                           type: integer
 *                         parkingSystemId:
 *                           type: integer
 *                         floor:
 *                           type: integer
 *                         floorColumn:
 *                           type: integer
 *                         carType:
 *                           type: string
 *                           enum: [Sedan, SUV, Suv]
 *     responses:
 *       200:
 *         description: Sync processed
 *       400:
 *         description: Validation error or operator assignment issue
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Operator access required
 *       404:
 *         description: Operator profile not found
 */
router.post('/parking-sync', authorize('operator'), validateParkingSync, operatorController.parkingSync);

module.exports = router;

