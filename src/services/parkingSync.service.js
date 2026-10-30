const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sequelize } = require('../config/database');
const {
  Operator,
  ParkingSystem,
  PalletAllotment,
  Car,
  User,
  Customer,
  ParkingRequest,
  Request,
  RequestQueue,
  CarAllotSyncLedger
} = require('../models/associations');
const { CAR_TYPE_VALUES } = require('../utils/constant');
const notificationService = require('./notification.service');
const websocketService = require('./websocket.service');

const PHASE_PARKING = 'parking';
const PHASE_RETRIEVAL = 'retrieval';

const getISTTime = () => {
  const now = new Date();
  const utcTime = now.getTime();
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(utcTime + istOffset);
};

const asDate = (value, fallback = null) => {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
};

const normalizeCarNumber = (value) => String(value ?? '').trim();

/** Omron sends last-4 (or full plate); normalize to last 4 non-space digits/chars. */
const normalizeLast4 = (value) => {
  const stripped = normalizeCarNumber(value).replace(/\s+/g, '');
  if (!stripped) return '';
  return stripped.length <= 4 ? stripped : stripped.slice(-4);
};

const plateLast4 = (carNumber) => normalizeLast4(carNumber);

const isDummyUsername = (username) =>
  typeof username === 'string' && username.toLowerCase().startsWith('dummynextcraft');

const normalizeCarType = (value) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'sedan') return 'Sedan';
  if (raw === 'suv') return 'SUV';
  return null;
};

const toResponsePallet = (pallet) => ({
  palletId: pallet.Id,
  parkingSystemId: pallet.ParkingSystemId,
  projectId: pallet.ProjectId,
  level: pallet.Level,
  levelBelowGround: pallet.LevelBelowGround,
  column: pallet.Column,
  status: pallet.Status,
  userId: pallet.UserId,
  carId: pallet.CarId
});

const resolvePalletWhere = (operator, parkingSystemType, floorMapping) => {
  const floor = parseInt(floorMapping.floor, 10);
  const column = parseInt(floorMapping.floorColumn, 10);

  if (!Number.isFinite(column) || column < 1) {
    throw new Error('Invalid floorColumn in floorMapping');
  }
  if (!Number.isFinite(floor) || floor === 0) {
    throw new Error('Invalid floor in floorMapping');
  }

  const where = {
    ParkingSystemId: operator.ParkingSystemId,
    ProjectId: operator.ProjectId,
    Column: column
  };

  if (parkingSystemType === 'Tower') {
    if (floor < 1) {
      throw new Error('Tower floor must be positive');
    }
    where.Level = floor;
    where.LevelBelowGround = null;
    return where;
  }

  if (floor > 0) {
    where.Level = floor;
    where.LevelBelowGround = null;
  } else {
    where.Level = null;
    where.LevelBelowGround = Math.abs(floor);
  }
  return where;
};

const findLedger = async (syncUuid, phase, transaction) => {
  if (!syncUuid) return null;
  return CarAllotSyncLedger.findOne({
    where: { SyncUuid: syncUuid, Phase: phase },
    transaction
  });
};

const writeLedger = async (
  {
    syncUuid,
    historyId,
    phase,
    operator,
    palletId,
    carId,
    userId,
    parkingRequestId
  },
  transaction
) => {
  if (!syncUuid) return null;

  const existing = await findLedger(syncUuid, phase, transaction);
  if (existing) return existing;

  const istTime = getISTTime();
  try {
    return await CarAllotSyncLedger.create(
      {
        SyncUuid: syncUuid,
        OmronHistoryId: historyId != null ? parseInt(historyId, 10) || null : null,
        Phase: phase,
        ParkingSystemId: operator.ParkingSystemId,
        ProjectId: operator.ProjectId,
        PalletId: palletId ?? null,
        CarId: carId ?? null,
        UserId: userId ?? null,
        ParkingRequestId: parkingRequestId ?? null,
        Status: 'applied',
        CreatedAt: istTime,
        UpdatedAt: istTime
      },
      { transaction }
    );
  } catch (err) {
    // Concurrent insert: treat unique violation as already applied.
    const raced = await findLedger(syncUuid, phase, transaction);
    if (raced) return raced;
    throw err;
  }
};

const findOrCreateDummyCustomer = async (operator, operatorUserId, transaction) => {
  let existingDummyCustomer = await Customer.findOne({
    where: {
      ParkingSystemId: operator.ParkingSystemId,
      ProjectId: operator.ProjectId
    },
    include: [
      {
        model: User,
        as: 'user',
        where: {
          Username: { [Op.like]: 'dummynextcraft%' }
        },
        attributes: ['Id', 'Username', 'Role']
      }
    ],
    transaction
  });

  if (existingDummyCustomer && existingDummyCustomer.user) {
    return {
      user: existingDummyCustomer.user,
      customer: existingDummyCustomer
    };
  }

  const uuid = crypto.randomUUID();
  const dummyUsername = `dummynextcraft${uuid}`;
  const hashedPassword = await bcrypt.hash('dummy123', 10);

  const user = await User.create(
    {
      Username: dummyUsername,
      Password: hashedPassword,
      Role: 'customer'
    },
    { transaction }
  );

  const istTime = getISTTime();
  const customer = await Customer.create(
    {
      UserId: user.Id,
      FirstName: 'Dummy',
      LastName: 'Customer',
      Email: null,
      MobileNumber: null,
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId,
      FlatNumber: null,
      Status: 'Approved',
      ApprovedBy: operatorUserId,
      ApprovedAt: istTime,
      CreatedAt: istTime,
      UpdatedAt: istTime
    },
    { transaction }
  );

  return { user, customer };
};

/** Cars in operator project + parking system whose plate ends with last4 (same rule as car-in / retrieve). */
const findCarsMatchingLast4InOperatorScope = async (operator, last4, transaction) => {
  const customerRows = await Customer.findAll({
    where: {
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId
    },
    attributes: ['UserId'],
    transaction
  });
  const userIds = [...new Set(customerRows.map((c) => c.UserId))];
  if (userIds.length === 0) {
    return [];
  }

  return Car.findAll({
    where: {
      UserId: { [Op.in]: userIds },
      [Op.and]: sequelize.where(
        sequelize.fn(
          'RIGHT',
          sequelize.fn('REPLACE', sequelize.col('CarNumber'), ' ', ''),
          4
        ),
        last4
      )
    },
    attributes: ['Id', 'UserId', 'CarType', 'CarModel', 'CarCompany', 'CarNumber'],
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['Id', 'Username', 'Role']
      }
    ],
    transaction
  });
};

const loadApprovedCustomerForCar = async (operator, car, transaction) => {
  const customer = await Customer.findOne({
    where: {
      UserId: car.UserId,
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId
    },
    transaction
  });
  if (!customer) {
    throw new Error('Customer not found for this car');
  }
  if (customer.Status !== 'Approved') {
    throw new Error('Customer is not approved. Only approved customers can be assigned to pallets');
  }
  return customer;
};

/**
 * Customer-first car resolve for parking-sync.
 * Never creates dummy when a real customer car matches last-4.
 */
const resolveOrCreateCarAndCustomer = async (
  operator,
  operatorUserId,
  carNumber,
  floorMappingCarType,
  transaction
) => {
  const last4 = normalizeLast4(carNumber);
  if (!last4) {
    throw new Error('carNumber is required');
  }

  const matches = await findCarsMatchingLast4InOperatorScope(operator, last4, transaction);
  const realMatches = matches.filter((c) => !isDummyUsername(c.user?.Username));
  const dummyMatches = matches.filter((c) => isDummyUsername(c.user?.Username));

  let chosen = null;

  if (realMatches.length > 1) {
    // Prefer car with open / Accepted / Queued parking request for this system.
    const openReqs = await ParkingRequest.findAll({
      where: {
        ProjectId: operator.ProjectId,
        ParkingSystemId: operator.ParkingSystemId,
        CarId: { [Op.in]: realMatches.map((c) => c.Id) },
        Status: { [Op.in]: ['Pending', 'Accepted', 'Queued'] }
      },
      order: [['UpdatedAt', 'DESC']],
      transaction
    });
    const preferredIds = [...new Set(openReqs.map((r) => r.CarId))];
    if (preferredIds.length === 1) {
      chosen = realMatches.find((c) => c.Id === preferredIds[0]);
    } else {
      throw new Error('Multiple cars match last 4 digits in this parking system');
    }
  } else if (realMatches.length === 1) {
    chosen = realMatches[0];
  } else if (dummyMatches.length >= 1) {
    chosen = dummyMatches[0];
  }

  if (chosen) {
    const customer = await loadApprovedCustomerForCar(operator, chosen, transaction);
    return { car: chosen, customer };
  }

  // Zero matches: true walk-in — create dummy user/car with the last-4 as CarNumber.
  const { user, customer } = await findOrCreateDummyCustomer(operator, operatorUserId, transaction);
  const normalizedCarType = normalizeCarType(floorMappingCarType);
  const carType = CAR_TYPE_VALUES.includes(normalizedCarType) ? normalizedCarType : null;
  const istTime = getISTTime();

  const car = await Car.create(
    {
      UserId: user.Id,
      CarType: carType,
      CarModel: null,
      CarCompany: null,
      CarNumber: last4,
      CreatedAt: istTime,
      UpdatedAt: istTime
    },
    { transaction }
  );

  return { car, customer };
};

/**
 * Complete (or synthesize) parking request for sync.
 * Returns hadExistingOpenRequest=true only when an open customer parking request was completed
 * (not when we invent a Completed history row).
 */
const ensureParkingRequestCompleted = async (
  operator,
  car,
  parkingTime,
  updatedAt,
  transaction
) => {
  const reqTime = asDate(parkingTime, getISTTime());
  const updTime = asDate(updatedAt, reqTime);

  // Prefer open request for this car, then any latest request.
  let parkingRequest = await ParkingRequest.findOne({
    where: {
      UserId: car.UserId,
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId,
      CarId: car.Id,
      Status: { [Op.in]: ['Pending', 'Accepted', 'Queued'] }
    },
    order: [['UpdatedAt', 'DESC']],
    transaction
  });

  let hadExistingOpenRequest = !!parkingRequest;

  if (!parkingRequest) {
    parkingRequest = await ParkingRequest.findOne({
      where: {
        UserId: car.UserId,
        ProjectId: operator.ProjectId,
        ParkingSystemId: operator.ParkingSystemId,
        CarId: car.Id
      },
      order: [['UpdatedAt', 'DESC']],
      transaction
    });
  }

  let justCompleted = false;
  let created = false;

  if (!parkingRequest) {
    parkingRequest = await ParkingRequest.create(
      {
        UserId: car.UserId,
        ProjectId: operator.ProjectId,
        ParkingSystemId: operator.ParkingSystemId,
        CarId: car.Id,
        Status: 'Completed',
        CreatedAt: reqTime,
        UpdatedAt: updTime
      },
      { transaction }
    );
    created = true;
  } else if (parkingRequest.Status !== 'Completed') {
    // Only count as "existing open" if it was Pending/Accepted/Queued (not a leftover odd status).
    hadExistingOpenRequest =
      hadExistingOpenRequest ||
      ['Pending', 'Accepted', 'Queued'].includes(parkingRequest.Status);
    await parkingRequest.update(
      {
        Status: 'Completed',
        UpdatedAt: updTime
      },
      { transaction }
    );
    justCompleted = true;
  }

  return {
    parkingRequest,
    hadExistingOpenRequest: hadExistingOpenRequest && justCompleted,
    justCompleted,
    created
  };
};

/**
 * Complete an open release Request for this car/pallet, or create Completed history.
 * hadExistingOpenRequest=true only when a real open release request was completed.
 */
const ensureReleaseRequestCompleted = async (
  operator,
  car,
  pallet,
  retrieveAt,
  parkingAt,
  transaction
) => {
  const doneAt = asDate(retrieveAt, getISTTime());
  const createdAt = asDate(parkingAt, doneAt);

  let openRequest = await Request.findOne({
    where: {
      CarId: car.Id,
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId,
      Status: { [Op.notIn]: ['Completed', 'Cancelled'] }
    },
    order: [['UpdatedAt', 'DESC']],
    transaction
  });

  if (!openRequest) {
    openRequest = await Request.findOne({
      where: {
        PalletAllotmentId: pallet.Id,
        ProjectId: operator.ProjectId,
        ParkingSystemId: operator.ParkingSystemId,
        Status: { [Op.notIn]: ['Completed', 'Cancelled'] }
      },
      order: [['UpdatedAt', 'DESC']],
      transaction
    });
  }

  if (openRequest) {
    const requestId = openRequest.Id;
    const userId = openRequest.UserId;
    const carId = openRequest.CarId;
    const palletAllotmentId = openRequest.PalletAllotmentId;

    await openRequest.update(
      {
        Status: 'Completed',
        UpdatedAt: doneAt
      },
      { transaction }
    );

    await RequestQueue.create(
      {
        UserId: openRequest.UserId,
        PalletAllotmentId: openRequest.PalletAllotmentId,
        ProjectId: openRequest.ProjectId,
        ParkingSystemId: openRequest.ParkingSystemId,
        CarId: openRequest.CarId,
        OperatorId: operator.Id,
        Status: 'Completed',
        EstimatedTime: openRequest.EstimatedTime || 0,
        CreatedAt: openRequest.CreatedAt || createdAt,
        UpdatedAt: doneAt
      },
      { transaction }
    );

    await openRequest.destroy({ transaction });
    return {
      requestId,
      userId,
      carId,
      palletId: palletAllotmentId,
      hadExistingOpenRequest: true,
      created: false
    };
  }

  // No open release request — create durable Completed queue history for this car.
  const queued = await RequestQueue.create(
    {
      UserId: car.UserId,
      PalletAllotmentId: pallet.Id,
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId,
      CarId: car.Id,
      OperatorId: operator.Id,
      Status: 'Completed',
      EstimatedTime: 0,
      CreatedAt: createdAt,
      UpdatedAt: doneAt
    },
    { transaction }
  );

  return {
    requestId: null,
    queueId: queued.Id,
    userId: car.UserId,
    carId: car.Id,
    palletId: pallet.Id,
    hadExistingOpenRequest: false,
    created: true
  };
};

/** After sync commit: notify customer that their parking request finished (car parked). */
const emitCarParkedIfNeeded = async ({
  shouldEmit,
  userId,
  customerId,
  car,
  pallet,
  parkingRequestId
}) => {
  if (!shouldEmit || !userId) return;
  try {
    const carInfo = car
      ? [car.CarCompany, car.CarModel, car.CarNumber].filter(Boolean).join(' ') || 'your car'
      : 'your car';
    const palletInfo =
      pallet?.UserGivenPalletNumber ||
      `Level ${pallet?.Level ?? pallet?.LevelBelowGround ?? '?'}, Column ${pallet?.Column ?? '?'}`;

    await notificationService.notifyCarParked(userId, {
      body: `Your car ${carInfo} has been parked on pallet ${palletInfo}.`,
      data: {
        palletId: String(pallet?.Id ?? ''),
        customerId: String(customerId ?? ''),
        carId: String(car?.Id ?? ''),
        parkingRequestId: String(parkingRequestId ?? '')
      }
    });

    websocketService.emitToUser(userId, 'pallet_assigned', {
      palletId: String(pallet?.Id ?? ''),
      customerId: String(customerId ?? ''),
      carId: String(car?.Id ?? ''),
      status: 'Assigned',
      parkingRequestId: String(parkingRequestId ?? '')
    });
  } catch (error) {
    console.error('[PARKING_SYNC] Failed to emit car parked:', error.message || error);
  }
};

/** After sync commit: notify customer that their release request finished (car released). */
const emitCarReleasedIfNeeded = async ({
  shouldEmit,
  userId,
  car,
  pallet,
  requestId
}) => {
  if (!shouldEmit || !userId) return;
  try {
    const carInfo = car
      ? [car.CarCompany, car.CarModel, car.CarNumber].filter(Boolean).join(' ') || 'your car'
      : 'your car';
    const palletInfo =
      pallet?.UserGivenPalletNumber ||
      `Level ${pallet?.Level ?? pallet?.LevelBelowGround ?? '?'}, Column ${pallet?.Column ?? '?'}`;

    await notificationService.notifyCarReleased(userId, {
      body: `Your car ${carInfo} has been released from pallet ${palletInfo}`,
      data: {
        palletId: String(pallet?.Id ?? ''),
        requestId: String(requestId ?? ''),
        carId: String(car?.Id ?? '')
      }
    });

    websocketService.emitToUser(userId, 'car_released', {
      palletId: pallet?.Id ?? null,
      requestId: requestId ?? null,
      carId: car?.Id ?? null,
      status: 'Completed'
    });
  } catch (error) {
    console.error('[PARKING_SYNC] Failed to emit car released:', error.message || error);
  }
};

/** Pallet already Assigned to a car whose plate last-4 matches history last-4 (park-car race / already correct). */
const loadAssignedPalletCarIfLast4Matches = async (pallet, historyLast4, transaction) => {
  if (pallet.Status !== 'Assigned' || !pallet.CarId || pallet.UserId === 0) {
    return null;
  }
  const assignedCar = await Car.findByPk(pallet.CarId, {
    include: [{ model: User, as: 'user', attributes: ['Id', 'Username', 'Role'] }],
    transaction
  });
  if (!assignedCar) return null;
  if (plateLast4(assignedCar.CarNumber) !== historyLast4) {
    return { conflict: true, assignedCar };
  }
  return { conflict: false, assignedCar };
};

const processParkingSync = async (operatorUserId, carAllotHistory = []) => {
  const operator = await Operator.findOne({
    where: { UserId: operatorUserId },
    include: [
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: ['Id', 'Type']
      }
    ]
  });

  if (!operator) {
    throw new Error('Operator profile not found');
  }
  if (!operator.ProjectId || !operator.ParkingSystemId || !operator.parkingSystem) {
    throw new Error('Operator is not assigned to a project and parking system');
  }

  const seenRowKeys = new Set();
  const sorted = [...carAllotHistory].sort((a, b) => {
    const aTime = asDate(a.parkingTime || a.updatedAt, new Date(0)).getTime();
    const bTime = asDate(b.parkingTime || b.updatedAt, new Date(0)).getTime();
    if (aTime !== bTime) return aTime - bTime;
    return 0;
  });

  const applied = [];
  const skipped = [];
  const failed = [];
  const ackCarAllotHistory = [];

  const pushAck = (syncUuid, isParkingSync, isRetrivalSync, historyId = null) => {
    if (!syncUuid) return;
    ackCarAllotHistory.push({
      syncUuid,
      historyId,
      isParkingSync: !!isParkingSync,
      isRetrivalSync: !!isRetrivalSync
    });
  };

  for (const row of sorted) {
    const historyId = row.id != null ? row.id : null;
    const syncUuid =
      row.syncUuid != null && String(row.syncUuid).trim() !== ''
        ? String(row.syncUuid).trim()
        : null;
    const rowFloorMapping = row.floorMapping || {};
    const rowKey =
      syncUuid != null
        ? `uuid:${syncUuid}`
        : historyId != null && historyId !== ''
          ? `id:${historyId}`
          : `c:${rowFloorMapping.id}|${row.parkingTime}|${normalizeCarNumber(row.carNumber)}|${row.retriveTime || ''}`;
    if (seenRowKeys.has(rowKey)) {
      skipped.push({ historyId, syncUuid, reason: 'Duplicate row in same payload' });
      continue;
    }
    seenRowKeys.add(rowKey);

    const t = await sequelize.transaction();
    try {
      if (!syncUuid) {
        throw new Error('syncUuid is required for durable parking-sync ACK');
      }

      const floorMapping = row.floorMapping;
      if (!floorMapping || typeof floorMapping !== 'object') {
        throw new Error('floorMapping is required for each history row');
      }
      if (parseInt(floorMapping.parkingSystemId, 10) !== operator.ParkingSystemId) {
        throw new Error('floorMapping does not belong to operator parking system');
      }

      const historyLast4 = normalizeLast4(row.carNumber);
      if (!historyLast4) {
        throw new Error('carNumber is required');
      }

      const parkingAt = asDate(row.parkingTime, getISTTime());
      const rowUpdatedAt = asDate(row.updatedAt, parkingAt);
      const retrieveAt = asDate(row.retriveTime, null);

      const parkingAckedOmron = row.isParkingSync === true;
      const retrievalAckedOmron = row.isRetrivalSync === true;
      const needsParking = !parkingAckedOmron;
      const needsRetrieval = !!retrieveAt && !retrievalAckedOmron;

      const parkingLedger = await findLedger(syncUuid, PHASE_PARKING, t);
      const retrievalLedger = retrieveAt
        ? await findLedger(syncUuid, PHASE_RETRIEVAL, t)
        : null;

      // Durable idempotency: ledger wins over Omron flag heuristics.
      if (parkingLedger && (!retrieveAt || retrievalLedger)) {
        await t.commit();
        skipped.push({
          historyId,
          syncUuid,
          reason: 'Already recorded in CarAllotSyncLedger'
        });
        pushAck(syncUuid, true, !!retrieveAt, historyId);
        continue;
      }

      if (parkingLedger && !retrieveAt) {
        await t.commit();
        skipped.push({
          historyId,
          syncUuid,
          reason: 'Parking phase already recorded in CarAllotSyncLedger'
        });
        pushAck(syncUuid, true, false, historyId);
        continue;
      }

      if (!needsParking && !needsRetrieval && parkingLedger && (!retrieveAt || retrievalLedger)) {
        await t.commit();
        skipped.push({
          historyId,
          syncUuid,
          reason: 'Nothing pending (ledger + Omron already ACKed)'
        });
        pushAck(syncUuid, true, !!retrieveAt && !!retrievalLedger, historyId);
        continue;
      }

      // Omron says already ACKed but no ledger: do not speculative-ACK without verifying ownership.
      if (!needsParking && !needsRetrieval && !parkingLedger) {
        // Fall through to verify pallet ownership below when we resolve pallet.
      }

      const palletWhere = resolvePalletWhere(operator, operator.parkingSystem.Type, floorMapping);
      const pallet = await PalletAllotment.findOne({
        where: palletWhere,
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!pallet) {
        throw new Error('Matching pallet not found for floor mapping');
      }

      // Overwrite guard / park-car race: pallet already Assigned to matching last-4.
      const assignedCheck = await loadAssignedPalletCarIfLast4Matches(pallet, historyLast4, t);
      if (assignedCheck?.conflict) {
        throw new Error(
          'Pallet is already assigned to a different car (last-4 mismatch); refusing overwrite'
        );
      }

      let car;
      let customer;
      let parkingRequestId = null;

      if (assignedCheck && !assignedCheck.conflict) {
        car = assignedCheck.assignedCar;
        customer = await loadApprovedCustomerForCar(operator, car, t);
      } else {
        ({ car, customer } = await resolveOrCreateCarAndCustomer(
          operator,
          operatorUserId,
          row.carNumber,
          floorMapping.carType,
          t
        ));
      }

      // Parking-only path (no retrieve yet)
      if (!retrieveAt) {
        if (parkingLedger) {
          await t.commit();
          skipped.push({
            historyId,
            syncUuid,
            reason: 'Parking phase already recorded in CarAllotSyncLedger'
          });
          pushAck(syncUuid, true, false, historyId);
          continue;
        }

        const alreadyCorrect =
          pallet.Status === 'Assigned' &&
          pallet.UserId === customer.UserId &&
          pallet.CarId === car.Id;

        if (alreadyCorrect || (assignedCheck && !assignedCheck.conflict)) {
          const completedPark = await ensureParkingRequestCompleted(
            operator,
            car,
            parkingAt,
            rowUpdatedAt,
            t
          );
          parkingRequestId = completedPark.parkingRequest?.Id ?? null;
          await writeLedger(
            {
              syncUuid,
              historyId,
              phase: PHASE_PARKING,
              operator,
              palletId: pallet.Id,
              carId: car.Id,
              userId: customer.UserId,
              parkingRequestId
            },
            t
          );
          await t.commit();
          await emitCarParkedIfNeeded({
            shouldEmit: completedPark.hadExistingOpenRequest,
            userId: customer.UserId,
            customerId: customer.Id,
            car,
            pallet,
            parkingRequestId
          });
          skipped.push({
            historyId,
            syncUuid,
            reason: 'Already synced state for active parking record'
          });
          pushAck(syncUuid, true, false, historyId);
          continue;
        }

        if (!needsParking && !alreadyCorrect) {
          // Omron claimed parking ACKed but NextKraft state is wrong and no ledger — fail so retry can fix.
          throw new Error(
            'Omron parking flag ACKed but NextKraft pallet ownership not verified; refusing speculative ACK'
          );
        }

        const completedPark = await ensureParkingRequestCompleted(
          operator,
          car,
          parkingAt,
          rowUpdatedAt,
          t
        );
        parkingRequestId = completedPark.parkingRequest?.Id ?? null;

        await pallet.update(
          {
            UserId: customer.UserId,
            CarId: car.Id,
            CarType:
              car.CarType ||
              (CAR_TYPE_VALUES.includes(normalizeCarType(floorMapping.carType))
                ? normalizeCarType(floorMapping.carType)
                : null),
            Status: 'Assigned',
            UpdatedAt: rowUpdatedAt
          },
          { transaction: t }
        );

        await writeLedger(
          {
            syncUuid,
            historyId,
            phase: PHASE_PARKING,
            operator,
            palletId: pallet.Id,
            carId: car.Id,
            userId: customer.UserId,
            parkingRequestId
          },
          t
        );

        await t.commit();
        await emitCarParkedIfNeeded({
          shouldEmit: completedPark.hadExistingOpenRequest,
          userId: customer.UserId,
          customerId: customer.Id,
          car,
          pallet,
          parkingRequestId
        });
        applied.push({
          historyId,
          syncUuid,
          action: 'parked',
          isParkingSync: true,
          isRetrivalSync: false,
          pallet: toResponsePallet(pallet),
          carId: car.Id,
          userId: customer.UserId
        });
        pushAck(syncUuid, true, false, historyId);
        continue;
      }

      // Retrieval path
      if (retrievalLedger) {
        if (!parkingLedger) {
          await writeLedger(
            {
              syncUuid,
              historyId,
              phase: PHASE_PARKING,
              operator,
              palletId: pallet.Id,
              carId: car.Id,
              userId: customer.UserId,
              parkingRequestId: null
            },
            t
          );
        }
        await t.commit();
        skipped.push({ historyId, syncUuid, reason: 'Retrieval phase already recorded in CarAllotSyncLedger' });
        pushAck(syncUuid, true, true, historyId);
        continue;
      }

      let targetPallet = pallet;
      /** Set when this retrieval row also completed an existing open parking request. */
      let pendingParkEmit = null;

      // Recovery: parking already in ledger or Omron ACKed; car may be on another pallet.
      if ((parkingLedger || parkingAckedOmron) && retrieveAt) {
        const parkedPallet = await PalletAllotment.findOne({
          where: {
            ParkingSystemId: operator.ParkingSystemId,
            ProjectId: operator.ProjectId,
            CarId: car.Id,
            Status: 'Assigned'
          },
          transaction: t,
          lock: t.LOCK.UPDATE
        });
        if (parkedPallet) {
          targetPallet = parkedPallet;
        }
      } else if (!parkingLedger) {
        const midPark = await ensureParkingRequestCompleted(
          operator,
          car,
          parkingAt,
          rowUpdatedAt,
          t
        );
        if (needsParking && targetPallet.Status !== 'Assigned') {
          const otherAssigned = await loadAssignedPalletCarIfLast4Matches(
            targetPallet,
            historyLast4,
            t
          );
          if (otherAssigned?.conflict) {
            throw new Error(
              'Pallet is already assigned to a different car (last-4 mismatch); refusing overwrite'
            );
          }
          if (!otherAssigned) {
            await targetPallet.update(
              {
                UserId: customer.UserId,
                CarId: car.Id,
                CarType:
                  car.CarType ||
                  (CAR_TYPE_VALUES.includes(normalizeCarType(floorMapping.carType))
                    ? normalizeCarType(floorMapping.carType)
                    : null),
                Status: 'Assigned',
                UpdatedAt: rowUpdatedAt
              },
              { transaction: t }
            );
          }
        }
        await writeLedger(
          {
            syncUuid,
            historyId,
            phase: PHASE_PARKING,
            operator,
            palletId: targetPallet.Id,
            carId: car.Id,
            userId: customer.UserId,
            parkingRequestId: midPark.parkingRequest?.Id ?? null
          },
          t
        );
        if (midPark.hadExistingOpenRequest) {
          pendingParkEmit = {
            userId: customer.UserId,
            customerId: customer.Id,
            parkingRequestId: midPark.parkingRequest?.Id ?? null
          };
        }
      }

      const dedupeQueue = await RequestQueue.findOne({
        where: {
          UserId: customer.UserId,
          PalletAllotmentId: targetPallet.Id,
          CarId: car.Id,
          Status: 'Completed',
          UpdatedAt: { [Op.gte]: new Date(retrieveAt.getTime() - 1000) }
        },
        transaction: t
      });

      if (targetPallet.Status === 'Released' && targetPallet.CarId === null && dedupeQueue) {
        await writeLedger(
          {
            syncUuid,
            historyId,
            phase: PHASE_RETRIEVAL,
            operator,
            palletId: targetPallet.Id,
            carId: car.Id,
            userId: customer.UserId,
            parkingRequestId: null
          },
          t
        );
        await t.commit();
        skipped.push({ historyId, syncUuid, reason: 'Already synced state for retrieved record' });
        pushAck(syncUuid, true, true, historyId);
        continue;
      }

      const releaseResult = await ensureReleaseRequestCompleted(
        operator,
        car,
        targetPallet,
        retrieveAt,
        parkingAt,
        t
      );

      await targetPallet.update(
        {
          UserId: 0,
          CarId: null,
          CarType: null,
          Status: 'Released',
          UpdatedAt: retrieveAt
        },
        { transaction: t }
      );

      await writeLedger(
        {
          syncUuid,
          historyId,
          phase: PHASE_RETRIEVAL,
          operator,
          palletId: targetPallet.Id,
          carId: car.Id,
          userId: customer.UserId,
          parkingRequestId: null
        },
        t
      );

      await t.commit();

      if (pendingParkEmit) {
        await emitCarParkedIfNeeded({
          shouldEmit: true,
          userId: pendingParkEmit.userId,
          customerId: pendingParkEmit.customerId,
          car,
          pallet: targetPallet,
          parkingRequestId: pendingParkEmit.parkingRequestId
        });
      }

      await emitCarReleasedIfNeeded({
        shouldEmit: releaseResult.hadExistingOpenRequest,
        userId: releaseResult.userId || customer.UserId,
        car,
        pallet: targetPallet,
        requestId: releaseResult.requestId
      });

      applied.push({
        historyId,
        syncUuid,
        action: 'retrieved',
        isParkingSync: true,
        isRetrivalSync: true,
        pallet: toResponsePallet(targetPallet),
        carId: car.Id,
        userId: customer.UserId
      });
      pushAck(syncUuid, true, true, historyId);
    } catch (error) {
      await t.rollback();
      failed.push({
        historyId,
        syncUuid,
        reason: error.message || 'Failed to process sync row'
      });
    }
  }

  return {
    applied,
    skipped,
    failed,
    ack: {
      carAllotHistory: ackCarAllotHistory
    },
    totals: {
      received: carAllotHistory.length,
      applied: applied.length,
      skipped: skipped.length,
      failed: failed.length,
      acked: ackCarAllotHistory.length
    }
  };
};

/**
 * Record durable ledger after live park-car / release-parked-car succeeds with Omron syncUuid.
 * Lets later parking-sync treat the phase as already applied (idempotent ACK path).
 */
const recordLiveSyncPhase = async ({
  syncUuid,
  phase,
  operator,
  palletId = null,
  carId = null,
  userId = null,
  parkingRequestId = null,
  historyId = null
}) => {
  const uuid = typeof syncUuid === 'string' ? syncUuid.trim() : '';
  if (!uuid) return null;
  if (phase !== PHASE_PARKING && phase !== PHASE_RETRIEVAL) {
    throw new Error(`Invalid sync phase: ${phase}`);
  }
  if (!operator?.ParkingSystemId || !operator?.ProjectId) {
    throw new Error('Operator scope required to record sync ledger');
  }

  return writeLedger(
    {
      syncUuid: uuid,
      historyId,
      phase,
      operator,
      palletId,
      carId,
      userId,
      parkingRequestId
    },
    null
  );
};

module.exports = {
  processParkingSync,
  recordLiveSyncPhase,
  PHASE_PARKING,
  PHASE_RETRIEVAL
};
