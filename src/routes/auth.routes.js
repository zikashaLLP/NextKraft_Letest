const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const {
  validateSignUp,
  validateLogin,
  validateUserProfileQuery,
  validateChangePassword,
  validateForgotPassword,
  validateVerifyForgotPasswordOtp
} = require('../validators/auth.validator');

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

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change password for the authenticated user
 *     description: |
 *       Changes password for the currently authenticated **customer**, **operator**, or **admin**.
 *       Requires the current password and a new password (min 6 characters).
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: "oldPassword123"
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: "newPassword123"
 *     responses:
 *       200:
 *         description: Password changed successfully
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
 *                   example: Password changed successfully
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
 *                           enum: [admin, operator, customer]
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error or current password incorrect
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.post('/change-password', authenticate, validateChangePassword, authController.changePassword);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a 6-digit password reset OTP by email
 *     description: |
 *       Looks up a **customer** or **operator** profile by email and emails a 6-digit OTP.
 *       Optional `role` should be sent when the same email exists on both customer and operator profiles.
 *       Response is intentionally generic when no account exists (anti-enumeration).
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.doe@example.com"
 *               role:
 *                 type: string
 *                 enum: [customer, operator]
 *                 description: Required only when email matches both a customer and an operator
 *                 example: customer
 *     responses:
 *       200:
 *         description: OTP dispatch attempted (generic success message)
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                       nullable: true
 *                     otpSent:
 *                       type: boolean
 *                       example: true
 *                     expiresInMinutes:
 *                       type: integer
 *                       example: 10
 *       400:
 *         description: Validation error, cooldown active, or ambiguous email/role
 *       503:
 *         description: Email service not configured and console OTP logging disabled
 */
router.post('/forgot-password', validateForgotPassword, authController.forgotPassword);

/**
 * @swagger
 * /api/auth/forgot-password/verify:
 *   post:
 *     summary: Verify forgot-password OTP, set new password, return profile + token
 *     description: |
 *       Verifies the 6-digit OTP for a customer/operator email, sets `newPassword`,
 *       and returns the role-specific profile plus a JWT token (same shape family as login + profile).
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.doe@example.com"
 *               otp:
 *                 type: string
 *                 pattern: "^[0-9]{6}$"
 *                 example: "483920"
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: "newPassword123"
 *               role:
 *                 type: string
 *                 enum: [customer, operator]
 *                 description: Required only when email matches both roles
 *                 example: customer
 *     responses:
 *       200:
 *         description: Password reset successful; profile and JWT returned
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
 *                   example: Password reset successful
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                     customer:
 *                       type: object
 *                       description: Present when role is customer
 *                     operator:
 *                       type: object
 *                       description: Present when role is operator
 *                     token:
 *                       type: string
 *                       description: JWT for subsequent authenticated API calls
 *       400:
 *         description: Invalid/expired OTP, validation error, or ambiguous email/role
 *       404:
 *         description: User not found
 */
router.post(
  '/forgot-password/verify',
  validateVerifyForgotPasswordOtp,
  authController.verifyForgotPasswordOtp
);

module.exports = router;

