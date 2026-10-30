const { AppConfig } = require('../models/associations');

const APP_TYPES = Object.freeze(['customer', 'operator']);

const MOBILE_VERSION_KEYS = Object.freeze({
  customer: 'mobile_version_customer',
  operator: 'mobile_version_operator'
});

const DEFAULT_MOBILE_VERSION = Object.freeze({
  ios: {
    latest_version: '3.1.10',
    min_supported_version: '3.1.10',
    app_url: ''
  },
  android: {
    latest_version: '3.1.10',
    min_supported_version: '3.1.10',
    app_url: ''
  },
  message: 'Please update the app to continue using services.'
});

const getISTTime = () => {
  const now = new Date();
  const utcTime = now.getTime();
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(utcTime + istOffset);
};

const normalizeAppType = (appType) => String(appType || '').trim().toLowerCase();

const assertAppType = (appType) => {
  const normalized = normalizeAppType(appType);
  if (!APP_TYPES.includes(normalized)) {
    throw new Error('appType must be either customer or operator');
  }
  return normalized;
};

const deepMerge = (base, patch) => {
  if (patch == null || typeof patch !== 'object' || Array.isArray(patch)) {
    return patch;
  }

  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (
      value != null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      base?.[key] != null &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
};

const cloneDefaultMobileVersion = () => ({
  ...DEFAULT_MOBILE_VERSION,
  ios: { ...DEFAULT_MOBILE_VERSION.ios },
  android: { ...DEFAULT_MOBILE_VERSION.android }
});

const parseMobileVersionValue = (raw) => {
  if (!raw) {
    return cloneDefaultMobileVersion();
  }

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return deepMerge(cloneDefaultMobileVersion(), parsed);
  } catch {
    throw new Error('Stored mobile version config is invalid JSON');
  }
};

const getConfigByKey = async (key) => {
  return AppConfig.findOne({ where: { Key: key } });
};

/**
 * Public: get mobile version config for customer or operator app.
 * Returns defaults when the key does not exist yet.
 */
const getMobileVersion = async (appType) => {
  const normalized = assertAppType(appType);
  const key = MOBILE_VERSION_KEYS[normalized];
  const row = await getConfigByKey(key);
  const config = parseMobileVersionValue(row?.Value);

  return {
    appType: normalized,
    ...config
  };
};

/**
 * Public helper: get both customer and operator configs.
 */
const getAllMobileVersions = async () => {
  const [customer, operator] = await Promise.all([
    getMobileVersion('customer'),
    getMobileVersion('operator')
  ]);

  return { customer, operator };
};

/**
 * Admin: update or create mobile version config for one app.
 * Missing nested keys are preserved from existing/default values (merge upsert).
 */
const upsertMobileVersion = async (appType, payload = {}) => {
  const normalized = assertAppType(appType);
  const key = MOBILE_VERSION_KEYS[normalized];

  const existing = await getConfigByKey(key);
  const current = parseMobileVersionValue(existing?.Value);
  const next = deepMerge(current, {
    ios: payload.ios,
    android: payload.android,
    message: payload.message
  });

  if (!next.ios || !next.android || typeof next.message !== 'string') {
    throw new Error('Invalid mobile version payload');
  }

  const istTime = getISTTime();
  const value = JSON.stringify(next);

  if (existing) {
    await existing.update({
      Value: value,
      UpdatedAt: istTime
    });
  } else {
    await AppConfig.create({
      Key: key,
      Value: value,
      CreatedAt: istTime,
      UpdatedAt: istTime
    });
  }

  return {
    appType: normalized,
    ...next
  };
};

module.exports = {
  APP_TYPES,
  MOBILE_VERSION_KEYS,
  DEFAULT_MOBILE_VERSION,
  getMobileVersion,
  getAllMobileVersions,
  upsertMobileVersion
};
