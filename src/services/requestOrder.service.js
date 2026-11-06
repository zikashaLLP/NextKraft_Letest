const { Op } = require('sequelize');
const {
  RequestOrders,
  ParkingRequest,
  Request,
  ParkingSystem,
  PalletAllotment,
  Car
} = require('../models/associations');
const requestEtaService = require('./requestEta.service');

const getISTTime = () => {
  const now = new Date();
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
};

const OPEN_STATUSES = ['Pending', 'Queued', 'Accepted'];

const getQueue = async (parkingSystemId, transaction = null) =>
  RequestOrders.findAll({
    where: { ParkingSystemId: parkingSystemId },
    order: [['OrderNumber', 'ASC']],
    transaction
  });

const getHighestOrderRequest = async (parkingSystemId, transaction = null) => {
  const row = await RequestOrders.findOne({
    where: { ParkingSystemId: parkingSystemId },
    order: [['OrderNumber', 'DESC']],
    transaction
  });
  return row;
};

const getOrderForRequest = async (parkingSystemId, requestType, requestId, transaction = null) =>
  RequestOrders.findOne({
    where: {
      ParkingSystemId: parkingSystemId,
      RequestType: requestType,
      RequestId: requestId
    },
    transaction
  });

const loadJobContext = async (orderRow, transaction = null) => {
  if (orderRow.RequestType === 'Parking') {
    const req = await ParkingRequest.findByPk(orderRow.RequestId, {
      include: [
        { model: Car, as: 'car', attributes: ['Id', 'CarType'] },
        {
          model: ParkingSystem,
          as: 'parkingSystem',
          attributes: [
            'Id',
            'ProjectId',
            'Type',
            'TimeForEachLevel',
            'TimeForHorizontalMove',
            'BufferTime'
          ]
        }
      ],
      transaction
    });
    if (!req) return null;
    const carType = requestEtaService.normalizeType(req.car?.CarType);
    // Target empty pallet is resolved inside ETA using lift start floor + reservations
    return {
      requestType: 'Parking',
      request: req,
      parkingSystem: req.parkingSystem,
      targetFloor: 0,
      carType,
      palletId: null,
      palletHomeFloor: null
    };
  }

  const req = await Request.findByPk(orderRow.RequestId, {
    include: [
      { model: Car, as: 'car', attributes: ['Id', 'CarType'] },
      {
        model: PalletAllotment,
        as: 'palletAllotment',
        attributes: ['Id', 'Level', 'LevelBelowGround', 'CarType']
      },
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: [
          'Id',
          'ProjectId',
          'Type',
          'TimeForEachLevel',
          'TimeForHorizontalMove',
          'BufferTime'
        ]
      }
    ],
    transaction
  });
  if (!req) return null;
  const pallet = req.palletAllotment;
  const carType =
    requestEtaService.normalizeType(pallet?.CarType) ||
    requestEtaService.normalizeType(req.car?.CarType);
  const targetFloor = requestEtaService.resolvePalletFloor(pallet);
  return {
    requestType: 'Release',
    request: req,
    parkingSystem: req.parkingSystem,
    targetFloor,
    carType,
    palletId: pallet?.Id || req.PalletAllotmentId,
    palletHomeFloor: targetFloor
  };
};

const persistEtaOnRequest = async (_requestType, request, totalEstimatedSeconds, at, transaction) => {
  request.EstimatedTime = Math.round(totalEstimatedSeconds);
  request.EstimatedTimeAt = at;
  await request.save({ transaction, fields: ['EstimatedTime', 'EstimatedTimeAt'] });
};

/**
 * Recalculate EstimatedTime / EstimatedTimeAt for the whole open queue (or fromOrderNumber onward).
 */
const reestimateQueue = async (
  parkingSystemId,
  { fromOrderNumber = 1, transaction = null } = {}
) => {
  const parkingSystem = await ParkingSystem.findByPk(parkingSystemId, { transaction });
  if (!parkingSystem) return [];

  const orders = await getQueue(parkingSystemId, transaction);
  let state = await requestEtaService.seedStateFromLiftLive(
    parkingSystem.ProjectId,
    parkingSystemId,
    transaction
  );
  // Replay jobs before fromOrderNumber to rebuild state without rewriting their ETA
  const at = getISTTime();
  const updated = [];
  const reservedEmptyPalletIds = new Set();

  for (const order of orders) {
    const ctx = await loadJobContext(order, transaction);
    if (!ctx || !ctx.parkingSystem) {
      continue;
    }

    const result = await requestEtaService.calculateRequestEstimatedTime({
      parkingSystem: ctx.parkingSystem,
      projectId: parkingSystem.ProjectId,
      parkingSystemId,
      requestType: ctx.requestType,
      targetFloor: ctx.targetFloor,
      carType: ctx.carType,
      palletId: ctx.palletId,
      palletHomeFloor: ctx.palletHomeFloor,
      previousState: state,
      excludePalletIds: reservedEmptyPalletIds,
      transaction
    });

    // Parking that claims a new empty slot (not the pallet already on the lift)
    if (
      ctx.requestType === 'Parking' &&
      result.palletId &&
      result.palletId !== state.palletId
    ) {
      reservedEmptyPalletIds.add(result.palletId);
    }

    if (order.OrderNumber >= fromOrderNumber) {
      await persistEtaOnRequest(
        ctx.requestType,
        ctx.request,
        result.totalEstimatedSeconds,
        at,
        transaction
      );
      updated.push({
        requestType: ctx.requestType,
        requestId: ctx.request.Id,
        orderNumber: order.OrderNumber,
        estimatedTime: result.totalEstimatedSeconds,
        estimatedTimeAt: at
      });
    }

    state = requestEtaService.stateFromEstimateResult(result);
  }

  return updated;
};

/**
 * Enqueue an open request. position: 'tail' | 'head'
 */
const enqueueRequest = async ({
  projectId,
  parkingSystemId,
  requestType,
  requestId,
  position = 'tail',
  transaction = null
}) => {
  const existing = await getOrderForRequest(parkingSystemId, requestType, requestId, transaction);
  if (existing) {
    // Already in queue — caller (accept/promote) owns any reestimate; do not reshuffle here.
    return existing;
  }

  const at = getISTTime();

  if (position === 'head') {
    const current = await getQueue(parkingSystemId, transaction);
    // Shift up from the end to avoid unique collisions
    for (let i = current.length - 1; i >= 0; i -= 1) {
      const row = current[i];
      await row.update(
        { OrderNumber: row.OrderNumber + 1, UpdatedAt: at },
        { transaction }
      );
    }
    const created = await RequestOrders.create(
      {
        ProjectId: projectId,
        ParkingSystemId: parkingSystemId,
        RequestType: requestType,
        RequestId: requestId,
        OrderNumber: 1,
        CreatedAt: at,
        UpdatedAt: at
      },
      { transaction }
    );
    await reestimateQueue(parkingSystemId, { transaction });
    return created;
  }

  const highest = await getHighestOrderRequest(parkingSystemId, transaction);
  const nextOrder = highest ? highest.OrderNumber + 1 : 1;
  const created = await RequestOrders.create(
    {
      ProjectId: projectId,
      ParkingSystemId: parkingSystemId,
      RequestType: requestType,
      RequestId: requestId,
      OrderNumber: nextOrder,
      CreatedAt: at,
      UpdatedAt: at
    },
    { transaction }
  );
  await reestimateQueue(parkingSystemId, { fromOrderNumber: nextOrder, transaction });
  return created;
};

const compactOrderNumbers = async (parkingSystemId, transaction = null) => {
  const orders = await getQueue(parkingSystemId, transaction);
  const at = getISTTime();
  // Two-pass to avoid unique constraint clashes
  for (let i = 0; i < orders.length; i += 1) {
    await orders[i].update(
      { OrderNumber: -(i + 1), UpdatedAt: at },
      { transaction }
    );
  }
  const refreshed = await getQueue(parkingSystemId, transaction);
  for (let i = 0; i < refreshed.length; i += 1) {
    await refreshed[i].update(
      { OrderNumber: i + 1, UpdatedAt: at },
      { transaction }
    );
  }
};

const removeRequestAndCompact = async ({
  parkingSystemId,
  requestType,
  requestId,
  transaction = null
}) => {
  const row = await getOrderForRequest(parkingSystemId, requestType, requestId, transaction);
  if (!row) {
    return null;
  }
  await row.destroy({ transaction });
  // Compact order numbers (2→1, 3→2, …), then refresh ETAs for the new queue.
  // Without reestimate, waiters keep a stale EstimatedTimeAt from the prior head
  // (e.g. 7 min clock keeps ticking → shows ~3 after the accepted job finishes).
  await compactOrderNumbers(parkingSystemId, transaction);
  await reestimateQueue(parkingSystemId, { fromOrderNumber: 1, transaction });
  return true;
};

/**
 * On Accept: if this request is already Order 1 → no reorder, but still reestimate
 * from Order 2 (Accept timer on #1 changed; waiters need a fresh total + EstimatedTimeAt).
 * If Accept is a middle/later order (e.g. 3) → promote it to Order 1 and shift former
 * 1..N-1 down (1→2, 2→3, …), then reestimate from Order 2 onward.
 *
 * Completion path: remove → compact → full reestimate (see removeRequestAndCompact).
 */
const promoteAcceptedToHead = async ({
  parkingSystemId,
  requestType,
  requestId,
  transaction = null
}) => {
  const row = await getOrderForRequest(parkingSystemId, requestType, requestId, transaction);
  if (!row) {
    return { wasAlreadyFirst: false, promoted: false };
  }

  if (row.OrderNumber === 1) {
    // Already head (common after complete compact). Still refresh everyone behind
    // so pending ETAs are based on this Accept, not a stale prior clock.
    await reestimateQueue(parkingSystemId, { fromOrderNumber: 2, transaction });
    return { wasAlreadyFirst: true, promoted: false };
  }

  const oldOrder = row.OrderNumber;
  const at = getISTTime();
  const queue = await getQueue(parkingSystemId, transaction);

  // Free this slot (temp negative) to avoid unique (ParkingSystemId, OrderNumber) clashes
  await row.update({ OrderNumber: -999999, UpdatedAt: at }, { transaction });

  // Shift former 1..(oldOrder-1) up by 1, high → low
  const ahead = queue
    .filter((o) => o.Id !== row.Id && o.OrderNumber < oldOrder)
    .sort((a, b) => b.OrderNumber - a.OrderNumber);

  for (const o of ahead) {
    await o.update({ OrderNumber: o.OrderNumber + 1, UpdatedAt: at }, { transaction });
  }

  await row.update({ OrderNumber: 1, UpdatedAt: at }, { transaction });

  // Accepted is now #1; refresh ETAs for everyone that moved behind it
  await reestimateQueue(parkingSystemId, { fromOrderNumber: 2, transaction });

  return { wasAlreadyFirst: false, promoted: true, previousOrder: oldOrder };
};

/**
 * Release Accept only: set AfterAcceptTimer + AcceptedAt from live PLC ETA.
 * Then promote-to-head if needed (middle accept → becomes order 1).
 * Parking must use promoteAcceptedToHead only (no AfterAcceptTimer).
 */
const applyAcceptTimers = async ({
  parkingSystemId,
  requestType,
  requestId,
  afterAcceptTimerSeconds,
  transaction = null
}) => {
  if (requestType !== 'Release') {
    return promoteAcceptedToHead({
      parkingSystemId,
      requestType,
      requestId,
      transaction
    });
  }

  const at = getISTTime();
  const req = await Request.findByPk(requestId, { transaction });
  if (req) {
    await req.update(
      {
        AfterAcceptTimer: Math.round(afterAcceptTimerSeconds),
        AcceptedAt: at,
        EstimatedTime: Math.round(afterAcceptTimerSeconds)
      },
      { transaction }
    );
  }

  return promoteAcceptedToHead({
    parkingSystemId,
    requestType,
    requestId,
    transaction
  });
};

const mapOrderNumbersByRequests = async (parkingSystemId, requestType, requestIds) => {
  if (!requestIds?.length) return new Map();
  const rows = await RequestOrders.findAll({
    where: {
      ParkingSystemId: parkingSystemId,
      RequestType: requestType,
      RequestId: { [Op.in]: requestIds }
    },
    attributes: ['RequestId', 'OrderNumber']
  });
  const map = new Map();
  for (const r of rows) map.set(r.RequestId, r.OrderNumber);
  return map;
};

module.exports = {
  OPEN_STATUSES,
  getQueue,
  getHighestOrderRequest,
  getOrderForRequest,
  enqueueRequest,
  removeRequestAndCompact,
  reestimateQueue,
  promoteAcceptedToHead,
  applyAcceptTimers,
  mapOrderNumbersByRequests,
  compactOrderNumbers
};
