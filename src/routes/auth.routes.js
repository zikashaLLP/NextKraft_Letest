const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateSignUp, validateLogin, validateUserProfileQuery } = require('../validators/auth.validator');

/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 example: "john_doe"
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: "password123"
 *               role:
 *                 type: string
 *                 enum: [customer]
 *                 default: "customer"
 *                 description: "Ignored if provided; users are always registered as customer"
 *     responses:
 *       201:
 *         description: User registered successfully
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
 *                     token:
 *                       type: string
 *       400:
 *         description: Validation error or username already exists
 */
router.post('/signup', validateSignUp, authController.signUp);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Universal login endpoint for all user types (admin, operator, customer)
 *     description: |
 *       This endpoint authenticates users of any role (admin, operator, or customer) and returns a JWT token.
 *       The JWT token contains the userId and role in its payload.
 *       Use this token in the Authorization header as "Bearer {token}" for protected routes.
 *     tags: [Authentication]
 *     security: []  # Override global security requirement for login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username for any user type (admin, operator, or customer)
 *                 example: "john_doe"
 *               password:
 *                 type: string
 *                 description: User password
 *                 example: "password123"
 *               fcmToken:
 *                 type: string
 *                 description: Firebase Cloud Messaging token for push notifications (optional)
 *                 example: "dGVzdF9mY21fdG9rZW4..."
 *     responses:
 *       200:
 *         description: Login successful. Returns user information and JWT token containing userId and role.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       description: User information
 *                       properties:
 *                         id:
 *                           type: integer
 *                           description: User ID
 *                           example: 1
 *                         username:
 *                           type: string
 *                           example: "john_doe"
 *                         role:
 *                           type: string
 *                           enum: [admin, operator, customer]
 *                           description: User role
 *                           example: "customer"
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     token:
 *                       type: string
 *                       description: JWT token containing userId and role in payload. Use as "Bearer {token}" in Authorization header.
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInJvbGUiOiJjdXN0b21lciIsImlhdCI6MTYzODQ5NjAwMCwiZXhwIjoxNjM4NTgyNDAwfQ.example"
 *       401:
 *         description: Invalid credentials (username or password incorrect)
 */
router.post('/login', validateLogin, authController.login);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout and remove this device FCM token from the user token array
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fcmToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @swagger
 * /api/auth/user-profile:
 *   get:
 *     summary: Get profile by user ID (authenticated)
 *     description: |
 *       Returns role-specific profile for the given **userId** (`users.Id`).
 *       - **customer** role → same shape as GET /api/customer/profile (`user` + `customer`)
 *       - **operator** role → same shape as GET /api/operator/profile (`user` + `operator`)
 *       - **admin** role → `user` object only (no extended profile table)
 *       **Access:** Admin — any user; Operator — self or customers in their project; Customer — own userId only.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Target user ID (users.Id)
 *         example: 5
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: User or role profile not found
 */
router.get(
  '/user-profile',
  authenticate,
  validateUserProfileQuery,
  authController.getProfileByUserId
);

module.exports = router;

