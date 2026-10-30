const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const appConfigController = require('../controllers/appConfig.controller');
const {
  validateAppTypeParam,
  validateUpdateMobileVersion
} = require('../validators/appConfig.validator');

/**
 * @swagger
 * /api/app-config/mobile-version:
 *   get:
 *     summary: Get mobile version configs for both apps (public)
 *     description: |
 *       Returns version configs for both **customer** and **operator** mobile apps.
 *       Each app has its own `app_configs` key:
 *       - `mobile_version_customer`
 *       - `mobile_version_operator`
 *     tags: [AppConfig]
 *     security: []
 *     responses:
 *       200:
 *         description: Mobile version configs retrieved successfully
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
 *                     customer:
 *                       type: object
 *                     operator:
 *                       type: object
 */
router.get('/mobile-version', appConfigController.getAllMobileVersions);

/**
 * @swagger
 * /api/app-config/mobile-version/{appType}:
 *   get:
 *     summary: Get mobile app version for one app (public)
 *     description: |
 *       Returns iOS/Android latest and minimum supported versions plus store URLs
 *       for either the **customer** or **operator** mobile app.
 *     tags: [AppConfig]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: appType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [customer, operator]
 *         example: customer
 *     responses:
 *       200:
 *         description: Mobile version config retrieved successfully
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
 *                     appType:
 *                       type: string
 *                       enum: [customer, operator]
 *                       example: customer
 *                     ios:
 *                       type: object
 *                       properties:
 *                         latest_version:
 *                           type: string
 *                           example: "3.1.10"
 *                         min_supported_version:
 *                           type: string
 *                           example: "3.1.10"
 *                         app_url:
 *                           type: string
 *                           example: ""
 *                     android:
 *                       type: object
 *                       properties:
 *                         latest_version:
 *                           type: string
 *                           example: "3.1.10"
 *                         min_supported_version:
 *                           type: string
 *                           example: "3.1.10"
 *                         app_url:
 *                           type: string
 *                           example: ""
 *                     message:
 *                       type: string
 *                       example: Please update the app to continue using services.
 *       400:
 *         description: Invalid appType
 *       500:
 *         description: Server error
 */
router.get(
  '/mobile-version/:appType',
  validateAppTypeParam,
  appConfigController.getMobileVersion
);

/**
 * @swagger
 * /api/app-config/mobile-version/{appType}:
 *   patch:
 *     summary: Update or create mobile app versions for one app (Admin only)
 *     description: |
 *       Upserts the app-specific key in `app_configs`:
 *       - customer → `mobile_version_customer`
 *       - operator → `mobile_version_operator`
 *
 *       Creates the key/value when missing; otherwise deep-merges partial updates.
 *     tags: [AppConfig]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [customer, operator]
 *         example: operator
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               ios:
 *                 type: object
 *                 properties:
 *                   latest_version:
 *                     type: string
 *                     example: "3.1.10"
 *                   min_supported_version:
 *                     type: string
 *                     example: "3.1.10"
 *                   app_url:
 *                     type: string
 *                     example: "https://apps.apple.com/app/idXXXX"
 *               android:
 *                 type: object
 *                 properties:
 *                   latest_version:
 *                     type: string
 *                     example: "3.1.10"
 *                   min_supported_version:
 *                     type: string
 *                     example: "3.1.10"
 *                   app_url:
 *                     type: string
 *                     example: "https://play.google.com/store/apps/details?id=com.example"
 *               message:
 *                 type: string
 *                 example: Please update the app to continue using services.
 *           examples:
 *             customerFull:
 *               summary: Full customer app update
 *               value:
 *                 ios:
 *                   latest_version: "3.1.10"
 *                   min_supported_version: "3.1.10"
 *                   app_url: ""
 *                 android:
 *                   latest_version: "3.1.10"
 *                   min_supported_version: "3.1.10"
 *                   app_url: ""
 *                 message: Please update the app to continue using services.
 *             operatorPartial:
 *               summary: Operator Android only
 *               value:
 *                 android:
 *                   latest_version: "3.2.0"
 *                   min_supported_version: "3.1.10"
 *     responses:
 *       200:
 *         description: Mobile version config updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.patch(
  '/mobile-version/:appType',
  authenticate,
  authorize('admin'),
  validateUpdateMobileVersion,
  appConfigController.updateMobileVersion
);

module.exports = router;
