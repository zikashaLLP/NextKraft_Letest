const admin = require('firebase-admin');
const config = require('../config/config');
const { User, Notification } = require('../models/associations');
const {
  parseFcmTokens,
  removeFcmToken,
  serializeFcmTokens
} = require('../utils/fcmTokens');

const NOTIFICATION_TYPES = {
  PARKING_REQUEST_CREATED: 'parking_request_created',
  CAR_RELEASE_REQUEST: 'car_release_request',
  PARKING_REQUEST_ACCEPTED: 'parking_request_accepted',
  PARKING_REQUEST_REJECTED: 'parking_request_rejected',
  REQUEST_ACCEPTED: 'request_accepted',
  REQUEST_REJECTED: 'request_rejected',
  CAR_PARKED: 'car_parked',
  CAR_RELEASED: 'car_released',
  PALLET_ASSIGNED: 'pallet_assigned',
  PARKING_REQUEST_STATUS_UPDATE: 'parking_request_status_update',
  REQUEST_STATUS_UPDATE: 'request_status_update',
  GENERAL: 'general'
};

let firebaseInitialized = false;

const initializeFirebase = () => {
  if (firebaseInitialized) {
    return;
  }

  try {
    if (config.fcm.serviceAccountKey) {
      const serviceAccount = JSON.parse(config.fcm.serviceAccountKey);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else if (config.fcm.serviceAccountPath) {
      admin.initializeApp({
        credential: admin.credential.cert(config.fcm.serviceAccountPath)
      });
    } else {
      console.warn('Firebase Admin SDK not initialized. FCM service account key not provided.');
      return;
    }
    firebaseInitialized = true;
    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
  }
};

initializeFirebase();

const toStringData = (data = {}) => {
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      out[key] = '';
    } else if (typeof value === 'object') {
      out[key] = JSON.stringify(value);
    } else {
      out[key] = String(value);
    }
  }
  return out;
};

const pruneInvalidToken = async (userId, token) => {
  try {
    const user = await User.findByPk(userId, { attributes: ['Id', 'FcmToken'] });
    if (!user) return;
    const next = removeFcmToken(user.FcmToken, token);
    await user.update({ FcmToken: serializeFcmTokens(next) });
    console.log(`Removed invalid FCM token for user ${userId}`);
  } catch (error) {
    console.error(`Error removing invalid FCM token for user ${userId}:`, error);
  }
};

const isInvalidTokenError = (error) =>
  error?.code === 'messaging/invalid-registration-token' ||
  error?.code === 'messaging/registration-token-not-registered';

/**
 * Persist inbox row + push FCM to all user tokens.
 * Single send path for all business notifications.
 */
const sendToUser = async ({ userId, title, body, type = NOTIFICATION_TYPES.GENERAL, data = {} }) => {
  try {
    const user = await User.findByPk(userId, {
      attributes: ['Id', 'FcmToken', 'Username']
    });

    if (!user) {
      console.log(`User ${userId} not found. Skipping notification.`);
      return { success: false, notificationId: null };
    }

    const dataPayload = toStringData({
      ...data,
      type,
      notificationType: type
    });

    const row = await Notification.create({
      UserId: userId,
      Type: type,
      Title: title,
      Body: body,
      DataJson: JSON.stringify(dataPayload),
      IsRead: false
    });

    dataPayload.notificationId = String(row.Id);
    dataPayload.timestamp = new Date().toISOString();

    const tokens = parseFcmTokens(user.FcmToken);
    if (!tokens.length) {
      console.log(`User ${userId} has no FCM tokens. Inbox saved, push skipped.`);
      return { success: true, notificationId: row.Id, pushed: 0 };
    }

    if (!firebaseInitialized) {
      console.warn('Firebase not initialized. Inbox saved, push skipped.');
      return { success: true, notificationId: row.Id, pushed: 0 };
    }

    const message = {
      notification: { title, body },
      data: dataPayload,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'nextkraft_alerts',
          tag: type,
          clickAction: 'OPEN_NOTIFICATION'
        }
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            'content-available': 1
          },
          ...dataPayload
        }
      },
      tokens
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(
      `Notification ${row.Id} to user ${userId}: success=${response.successCount} failure=${response.failureCount}`
    );

    if (response.responses) {
      await Promise.all(
        response.responses.map(async (res, index) => {
          if (res.success) return;
          if (isInvalidTokenError(res.error)) {
            await pruneInvalidToken(userId, tokens[index]);
          } else {
            console.error(`FCM send failure for user ${userId}:`, res.error?.message || res.error);
          }
        })
      );
    }

    return {
      success: response.successCount > 0 || tokens.length === 0,
      notificationId: row.Id,
      pushed: response.successCount
    };
  } catch (error) {
    console.error(`Error sending notification to user ${userId}:`, error);
    return { success: false, notificationId: null };
  }
};

/** @deprecated Prefer sendToUser / typed helpers */
const sendNotificationToUser = async (userId, title, body, data = {}) => {
  const type = data.type || data.notificationType || NOTIFICATION_TYPES.GENERAL;
  const { ...rest } = data;
  const result = await sendToUser({ userId, title, body, type, data: rest });
  return !!result.success;
};

const sendNotificationToUsers = async (userIds, title, body, data = {}) => {
  if (!Array.isArray(userIds) || userIds.length === 0) return 0;
  let successCount = 0;
  for (const userId of userIds) {
    const ok = await sendNotificationToUser(userId, title, body, data);
    if (ok) successCount += 1;
  }
  return successCount;
};

const notifyParkingRequestCreated = (userId, payload) =>
  sendToUser({
    userId,
    title: 'New Parking Request',
    body: payload.body,
    type: NOTIFICATION_TYPES.PARKING_REQUEST_CREATED,
    data: payload.data || {}
  });

const notifyCarReleaseRequest = (userId, payload) =>
  sendToUser({
    userId,
    title: 'New Car Release Request',
    body: payload.body,
    type: NOTIFICATION_TYPES.CAR_RELEASE_REQUEST,
    data: payload.data || {}
  });

const notifyParkingRequestAccepted = (userId, payload) =>
  sendToUser({
    userId,
    title: 'Parking Request Accepted',
    body: payload.body,
    type: NOTIFICATION_TYPES.PARKING_REQUEST_ACCEPTED,
    data: payload.data || {}
  });

const notifyParkingRequestRejected = (userId, payload) =>
  sendToUser({
    userId,
    title: 'Parking Request Rejected',
    body: payload.body,
    type: NOTIFICATION_TYPES.PARKING_REQUEST_REJECTED,
    data: payload.data || {}
  });

const notifyReleaseRequestAccepted = (userId, payload) =>
  sendToUser({
    userId,
    title: 'Release Request Accepted',
    body: payload.body,
    type: NOTIFICATION_TYPES.REQUEST_ACCEPTED,
    data: payload.data || {}
  });

const notifyReleaseRequestRejected = (userId, payload) =>
  sendToUser({
    userId,
    title: 'Release Request Rejected',
    body: payload.body,
    type: NOTIFICATION_TYPES.REQUEST_REJECTED,
    data: payload.data || {}
  });

const notifyCarParked = (userId, payload) =>
  sendToUser({
    userId,
    title: 'Car Parked',
    body: payload.body,
    type: NOTIFICATION_TYPES.CAR_PARKED,
    data: payload.data || {}
  });

const notifyCarReleased = (userId, payload) =>
  sendToUser({
    userId,
    title: 'Car Released',
    body: payload.body,
    type: NOTIFICATION_TYPES.CAR_RELEASED,
    data: payload.data || {}
  });

const listNotificationsForUser = async (userId, { limit = 50, offset = 0 } = {}) => {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const { rows, count } = await Notification.findAndCountAll({
    where: { UserId: userId },
    order: [['CreatedAt', 'DESC']],
    limit: safeLimit,
    offset: safeOffset
  });

  const unreadCount = await Notification.count({
    where: { UserId: userId, IsRead: false }
  });

  return {
    notifications: rows.map((n) => {
      let data = {};
      try {
        data = n.DataJson ? JSON.parse(n.DataJson) : {};
      } catch {
        data = {};
      }
      return {
        id: n.Id,
        type: n.Type,
        title: n.Title,
        body: n.Body,
        data,
        isRead: !!n.IsRead,
        createdAt: n.CreatedAt,
        updatedAt: n.UpdatedAt
      };
    }),
    total: count,
    unreadCount,
    limit: safeLimit,
    offset: safeOffset
  };
};

const markNotificationRead = async (userId, notificationId) => {
  const row = await Notification.findOne({
    where: { Id: notificationId, UserId: userId }
  });
  if (!row) {
    throw new Error('Notification not found');
  }
  if (!row.IsRead) {
    await row.update({ IsRead: true });
  }
  return { id: row.Id, isRead: true };
};

const markAllNotificationsRead = async (userId) => {
  const [updated] = await Notification.update(
    { IsRead: true },
    { where: { UserId: userId, IsRead: false } }
  );
  return { updated };
};

module.exports = {
  NOTIFICATION_TYPES,
  initializeFirebase,
  sendToUser,
  sendNotificationToUser,
  sendNotificationToUsers,
  notifyParkingRequestCreated,
  notifyCarReleaseRequest,
  notifyParkingRequestAccepted,
  notifyParkingRequestRejected,
  notifyReleaseRequestAccepted,
  notifyReleaseRequestRejected,
  notifyCarParked,
  notifyCarReleased,
  listNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead
};
