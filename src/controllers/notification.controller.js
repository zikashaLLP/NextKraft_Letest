const notificationService = require('../services/notification.service');
const { successResponse, errorResponse } = require('../utils');

const listNotifications = async (req, res) => {
  try {
    const result = await notificationService.listNotificationsForUser(req.user.id, {
      limit: req.query.limit,
      offset: req.query.offset
    });
    return successResponse(res, result, 'Notifications retrieved successfully');
  } catch (error) {
    console.error('List notifications error:', error);
    return errorResponse(res, error.message || 'Failed to list notifications', 500);
  }
};

const markRead = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await notificationService.markNotificationRead(req.user.id, id);
    return successResponse(res, result, 'Notification marked as read');
  } catch (error) {
    console.error('Mark notification read error:', error);
    const statusCode = error.message === 'Notification not found' ? 404 : 500;
    return errorResponse(res, error.message || 'Failed to mark notification read', statusCode);
  }
};

const markAllRead = async (req, res) => {
  try {
    const result = await notificationService.markAllNotificationsRead(req.user.id);
    return successResponse(res, result, 'All notifications marked as read');
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    return errorResponse(res, error.message || 'Failed to mark all read', 500);
  }
};

module.exports = {
  listNotifications,
  markRead,
  markAllRead
};
