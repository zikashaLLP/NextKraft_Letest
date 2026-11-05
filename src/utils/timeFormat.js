/**
 * Format a DB timestamp for API clients in IST (+05:30).
 *
 * NextKraft writes timestamps via getISTTime() (UTC clock + 5:30 stuffed into a Date).
 * Sequelize then serializes those as `...Z`, so mobile Date.parse + Date.now() thinks
 * the event is ~5.5h in the future and ETA shows hundreds of minutes.
 *
 * Emitting the same wall-clock with an explicit `+05:30` offset makes Date.parse
 * resolve to the correct absolute instant.
 *
 * @param {Date|string|number|null|undefined} value
 * @returns {string|null} e.g. 2026-11-05T19:30:00.000+05:30
 */
const formatDateTimeAsIst = (value) => {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return null;

  const pad = (n, len = 2) => String(n).padStart(len, '0');
  // getISTTime() stores IST wall-clock in the Date's UTC fields — reuse those fields.
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
    `.${pad(d.getUTCMilliseconds(), 3)}+05:30`
  );
};

/**
 * Sort operator/customer open requests by RequestOrders orderNumber ascending.
 * Rows without an order number sink to the end (then by createdAt ASC).
 *
 * @param {Array<{ orderNumber?: number|null, createdAt?: string|Date|null }>} items
 * @returns {Array}
 */
const sortByOrderNumberAsc = (items) => {
  if (!Array.isArray(items)) return items;
  return [...items].sort((a, b) => {
    const ao = a.orderNumber != null && Number(a.orderNumber) > 0 ? Number(a.orderNumber) : null;
    const bo = b.orderNumber != null && Number(b.orderNumber) > 0 ? Number(b.orderNumber) : null;
    if (ao != null && bo != null && ao !== bo) return ao - bo;
    if (ao != null && bo == null) return -1;
    if (ao == null && bo != null) return 1;
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return at - bt;
  });
};

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
  formatDateTimeAsIst,
  sortByOrderNumberAsc,
  formatEstimatedTimeInMinutes,
  formatEstimatedTimeMmSs,
};
