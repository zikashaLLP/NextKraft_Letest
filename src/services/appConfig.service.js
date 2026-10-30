const { AppConfig } = require('../models/associations');

const MOBILE_VERSION_KEY = 'mobile_version';

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

const parseMobileVersionValue = (raw) => {
  if (!raw) {
    return { ...DEFAULT_MOBILE_VERSION, ios: { ...DEFAULT_MOBILE_VERSION.ios }, android: { ...DEFAULT_MOBILE_VERSION.android } };
  }

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return deepMerge(
      {
        ...DEFAULT_MOBILE_VERSION,
        ios: { ...DEFAULT_MOBILE_VERSION.ios },
        android: { ...DEFAULT_MOBILE_VERSION.android }
      },
      parsed
    );
  } catch {
    throw new Error('Stored mobile version config is invalid JSON');
  }
};

const getConfigByKey = async (key) => {
  return AppConfig.findOne({ where: { Key: key } });
};

/**
 * Public: get mobile version config.
 * Returns defaults when the key does not exist yet.
 */
const getMobileVersion = async () => {
  const row = await getConfigByKey(MOBILE_VERSION_KEY);
  return parseMobileVersionValue(row?.Value);
};

/**
 * Admin: update or create mobile version config.
 * Missing nested keys are preserved from existing/default values (merge upsert).
 */
const upsertMobileVersion = async (payload = {}) => {
  const existing = await getConfigByKey(MOBILE_VERSION_KEY);
  const current = parseMobileVersionValue(existing?.Value);
  const next = deepMerge(current, {
    ios: payload.ios,
    android: payload.android,
    message: payload.message
  });

  // Basic shape guard after merge
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
      Key: MOBILE_VERSION_KEY,
      Value: value,
      CreatedAt: istTime,
      UpdatedAt: istTime
    });
  }

  return next;
};

module.exports = {
  MOBILE_VERSION_KEY,
  DEFAULT_MOBILE_VERSION,
  getMobileVersion,
  upsertMobileVersion
};
