/**
 * Format estimated duration as whole minutes only (no seconds).
 * Partial minutes round up so ETA is never understated.
 *
 * @param {number|null|undefined} seconds
 * @returns {string|null}
 */
const formatEstimatedTimeInMinutes = (seconds) => {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) {
    return null;
  }

  const totalSeconds = Math.max(0, Number(seconds));
  const minutes = totalSeconds === 0 ? 0 : Math.max(1, Math.ceil(totalSeconds / 60));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
};

/**
 * Format duration as M:SS (e.g. 2:00, 1:59, 0:05).
 *
 * @param {number|null|undefined} seconds
 * @returns {string|null}
 */
const formatEstimatedTimeMmSs = (seconds) => {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.floor(Number(seconds)));
  const minutes = Math.floor(totalSeconds / 60);
  const rem = totalSeconds % 60;
  return `${minutes}:${String(rem).padStart(2, '0')}`;
};

module.exports = {
  formatEstimatedTimeInMinutes,
  formatEstimatedTimeMmSs,
};
