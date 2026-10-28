const MAX_FCM_TOKENS = 10;

/**
 * Normalize User.FcmToken TEXT into a string[] (supports legacy single token).
 */
const parseFcmTokens = (raw) => {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((t) => String(t).trim()).filter(Boolean))];
  }
  const text = String(raw).trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.map((t) => String(t).trim()).filter(Boolean))];
      }
    } catch {
      // fall through — treat as raw token string
    }
  }
  return [text];
};

const serializeFcmTokens = (tokens) => JSON.stringify(parseFcmTokens(tokens));

const addFcmToken = (raw, token) => {
  const next = String(token || '').trim();
  if (!next) return parseFcmTokens(raw);
  const list = parseFcmTokens(raw).filter((t) => t !== next);
  list.push(next);
  while (list.length > MAX_FCM_TOKENS) list.shift();
  return list;
};

const removeFcmToken = (raw, token) => {
  const drop = String(token || '').trim();
  if (!drop) return parseFcmTokens(raw);
  return parseFcmTokens(raw).filter((t) => t !== drop);
};

module.exports = {
  MAX_FCM_TOKENS,
  parseFcmTokens,
  serializeFcmTokens,
  addFcmToken,
  removeFcmToken
};
