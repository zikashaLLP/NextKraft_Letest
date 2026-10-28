const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const notificationController = require('../controllers/notification.controller');

router.use(authenticate);

/**
 * GET /api/notifications
 * List inbox for the authenticated user (newest first).
 */
router.get('/', notificationController.listNotifications);

/**
 * POST /api/notifications/read-all
 */
router.post('/read-all', notificationController.markAllRead);

/**
 * PATCH /api/notifications/:id/read
 */
router.patch('/:id/read', notificationController.markRead);

module.exports = router;
