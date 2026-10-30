const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const appConfigController = require('../controllers/appConfig.controller');
const { validateUpdateMobileVersion } = require('../validators/appConfig.validator');

/**
 * @swagger
 * /api/app-config/mobile-version:
 *   get:
 *     summary: Get mobile app version and store URLs (public)
 *     description: |
 *       Returns iOS/Android latest and minimum supported versions plus store URLs.
 *       Public endpoint (no authentication).
 *       If the `mobile_version` app config key does not exist yet, built-in defaults are returned.
 *     tags: [AppConfig]
 *     security: []
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
 *                   example: Mobile version config retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
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
 *       500:
 *         description: Server error
 */
router.get('/mobile-version', appConfigController.getMobileVersion);

/**
 * @swagger
 * /api/app-config/mobile-version:
 *   patch:
 *     summary: Update or create mobile app versions (Admin only)
 *     description: |
 *       Upserts the `mobile_version` key in `app_configs`.
 *       - Creates the key/value row when missing.
 *       - Updates existing values when present.
 *       - Partial payloads are deep-merged with the current config (or defaults).
 *     tags: [AppConfig]
 *     security:
 *       - bearerAuth: []
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
 *             fullUpdate:
 *               summary: Full update
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
 *             partialIos:
 *               summary: Update iOS versions only
 *               value:
 *                 ios:
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
  '/mobile-version',
  authenticate,
  authorize('admin'),
  validateUpdateMobileVersion,
  appConfigController.updateMobileVersion
);

module.exports = router;
