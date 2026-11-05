/**
 * Common request ETA calculator (Tower primary; Puzzle thin adapter).
 *
 * Tower formula (same as towerTiming.js):
 *   Total =
 *     (C1 × c1Count) + (C2 × c2Count)
 *     + (SecondsPerFloor × totalFloorDistance)
 *     + (TraverseTime × traverseCount)
 *
 * Traverse rules (product):
 * PARK
 *   - No pallet on lift: nearest empty → ground → park up → traverse 2
 *     path: L → E → 0 → E  (L may be any floor)
 *   - Different type on lift: store home, nearest empty, ground, park → traverse 3
 *     path: 0 → S → E → 0 → E  (pallet-on-lift always starts at floor 0)
 *   - Same type on lift: park that pallet home → traverse 1
 *     path: 0 → H
 *
 * RELEASE
 *   - No pallet on lift: go to car, bring to ground → traverse 1
 *     path: F → T → 0  (F any floor)
 *   - Pallet on lift: store home, fetch car, ground → traverse 2
 *     path: 0 → P → T → 0  (pallet-on-lift always starts at floor 0)
 *
 * Live release Accept (F): still uses calculateTowerReleaseEstimatedTime + PLC/TT.
 */

const { Op } = require('sequelize');
const { PalletAllotment } = require('../models/associations');
const {
  TOWER_C1_SEC,
  TOWER_C2_SEC,
  TOWER_SECONDS_PER_FLOOR,
  TOWER_CONSTANT_TRAVERSE_TIME_SEC,
  calculateTowerReleaseEstimatedTime,
  resolveTowerTtAdditiveSeconds
} = require('../utils/towerTiming');
const liftLiveAnalysisService = require('./liftLiveAnalysis.service');

const normalizeType = (value) => {
  if (value == null || value === '' || value === 'None') return null;
  if (typeof value === 'number') {
    if (value === 1) return 'Sedan';
    if (value === 2) return 'SUV';
    return null;
  }
  const raw = String(value).trim().toLowerCase();
  if (raw === 'sedan' || raw === '1') return 'Sedan';
  if (raw === 'suv' || raw === '2') return 'SUV';
  return null;
};

/**
 * Mechanical counts aligned with traverse count and existing release defaults:
 * traverse 1 → c1=1,c2=2 ; traverse 2 → c1=2,c2=3 ; traverse 3 → c1=3,c2=4
 */
const countsForTraverse = (traverseCount) => {
  const t = Math.max(1, Number(traverseCount) || 1);
  if (t === 1) return { c1Count: 1, c2Count: 2, traverseCount: 1 };
  if (t === 2) return { c1Count: 2, c2Count: 3, traverseCount: 2 };
  return { c1Count: 3, c2Count: 4, traverseCount: 3 };
};

const sumFloorDistance = (floors) => {
  let dist = 0;
  for (let i = 1; i < floors.length; i += 1) {
    dist += Math.abs(Number(floors[i] || 0) - Number(floors[i - 1] || 0));
  }
  return dist;
};

/**
 * Single path → one formula application (no stacked full-release calls).
 * Side TT (+45) when target slot PalletDetails.TT === 11 (Extra TT stays Accept/live only).
 * @param {number[]} floors - ordered waypoints e.g. [0, 3, 5, 0]
 * @param {number} traverseCount - 1 | 2 | 3
 * @param {number|null} [targetTt] - stored/synced slot TT for the job target pallet
 */
const timeForPath = (floors, traverseCount, targetTt = null) => {
  const { c1Count, c2Count, traverseCount: t } = countsForTraverse(traverseCount);
  const totalFloorDistance = sumFloorDistance(floors);
  const ttAdditive = resolveTowerTtAdditiveSeconds(targetTt, { hasPalletOnLift: false });
  return Math.round(
    TOWER_C1_SEC * c1Count +
      TOWER_C2_SEC * c2Count +
      TOWER_SECONDS_PER_FLOOR * totalFloorDistance +
      TOWER_CONSTANT_TRAVERSE_TIME_SEC * t +
      ttAdditive
  );
};

const resolvePalletFloor = (pallet) => {
  if (!pallet) return 0;
  if (pallet.Level != null) return Number(pallet.Level) || 0;
  if (pallet.LevelBelowGround != null) return Number(pallet.LevelBelowGround) || 0;
  return 0;
};

/**
 * Nearest empty (Released) pallet of the given CarType to liftFloor.
 * @param {Set<number>|number[]} [excludePalletIds]
 */
const findNearestEmptyPallet = async ({
  projectId,
  parkingSystemId,
  carType,
  liftFloor = 0,
  excludePalletIds = null,
  transaction = null
}) => {
  const type = normalizeType(carType);
  const exclude = excludePalletIds
    ? excludePalletIds instanceof Set
      ? excludePalletIds
      : new Set(excludePalletIds)
    : null;

  const where = {
    ProjectId: projectId,
    ParkingSystemId: parkingSystemId,
    Status: 'Released',
    UserId: 0,
    CarId: { [Op.is]: null }
  };

  const pallets = await PalletAllotment.findAll({
    where,
    transaction
  });

  if (!pallets.length) return null;

  const typed = type
    ? pallets.filter((p) => normalizeType(p.CarType) === type)
    : pallets;
  const pool = (typed.length ? typed : pallets).filter(
    (p) => !exclude || !exclude.has(p.Id)
  );
  if (!pool.length) return null;

  let best = null;
  let bestDist = Infinity;
  for (const p of pool) {
    const f = resolvePalletFloor(p);
    const d = Math.abs(f - Number(liftFloor || 0));
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
};

const emptyLiftState = (liftFloor = 0) => ({
  liftFloor: Number(liftFloor || 0),
  palletTypeOnLift: null,
  palletId: null,
  lastRequestType: null,
  totalEstimatedSeconds: 0
});

const seedStateFromLiftLive = async (projectId, parkingSystemId, transaction = null) => {
  const row = await liftLiveAnalysisService.ensureLiftLiveAnalysis(
    projectId,
    parkingSystemId,
    transaction
  );
  const type = normalizeType(row.PalletTypeOnLift);
  // Product rule: when a pallet is on the lift, lift is at ground (0).
  const liftFloor = type || row.PalletId ? 0 : Number(row.LiftFloor || 0);
  return {
    liftFloor,
    palletTypeOnLift: type,
    palletId: row.PalletId || null,
    lastRequestType: type ? 'Release' : null,
    totalEstimatedSeconds: 0
  };
};

const calculatePuzzleSegmentSeconds = ({ parkingSystem, targetFloor, isBelowGround = false }) => {
  const level = Number(targetFloor || 0);
  const per = Number(parkingSystem.TimeForEachLevel || 0);
  const buffer = Number(parkingSystem.BufferTime || 0);
  const horiz = Number(parkingSystem.TimeForHorizontalMove || 0);
  if (isBelowGround) {
    if (level <= 1) return Math.round(level * per + buffer);
    return Math.round(level * per + (level * per + horiz + buffer));
  }
  return Math.round(level * per + (level > 1 ? horiz : 0) + buffer);
};

const resolveStoreHomePallet = async (prev, fallbackFloor, transaction) => {
  if (prev.palletId) {
    const home = await PalletAllotment.findByPk(prev.palletId, {
      attributes: ['Id', 'Level', 'LevelBelowGround', 'TT'],
      transaction
    });
    if (home) {
      return {
        floor: resolvePalletFloor(home),
        tt: home.TT != null ? Number(home.TT) : null,
        palletId: home.Id
      };
    }
  }
  return {
    floor: Number(fallbackFloor || 0) || 1,
    tt: null,
    palletId: prev.palletId || null
  };
};

const resolvePalletTtById = async (palletId, transaction = null) => {
  if (!palletId) return null;
  const row = await PalletAllotment.findByPk(palletId, {
    attributes: ['TT'],
    transaction
  });
  return row && row.TT != null ? Number(row.TT) : null;
};

/**
 * Compute one job segment given prior simulated lift state.
 */
const calculateRequestEstimatedTime = async ({
  parkingSystem,
  projectId,
  parkingSystemId,
  requestType,
  targetFloor,
  carType,
  palletId = null,
  palletHomeFloor = null,
  previousState = null,
  live = null,
  excludePalletIds = null,
  transaction = null
}) => {
  const type = normalizeType(carType);
  const target = Number(targetFloor || 0);
  const prev =
    previousState ||
    (await seedStateFromLiftLive(
      projectId || parkingSystem.ProjectId,
      parkingSystemId || parkingSystem.Id,
      transaction
    ));
  const prevTotal = Number(prev.totalEstimatedSeconds || 0);
  const liftHasPallet = !!(prev.palletTypeOnLift || prev.palletId);
  // Product rule: pallet on lift ⇒ start at ground
  const startFloor = liftHasPallet ? 0 : Number(prev.liftFloor || 0);

  // F) Live release Accept — PLC-aware (unchanged)
  if (live && requestType === 'Release') {
    const segmentSeconds = calculateTowerReleaseEstimatedTime({
      targetFloor: target,
      currentFloor: Number(live.currentFloor || 0),
      palletFloor: Number(live.palletFloor || 0),
      hasPalletOnLift: live.hasPalletOnLift,
      tt: live.tt,
      w310: live.w310,
      w313: live.w313
    });
    return {
      segmentSeconds,
      totalEstimatedSeconds: segmentSeconds,
      endLiftFloor: 0,
      endPalletTypeOnLift: type,
      endPalletId: palletId,
      endLastRequestType: 'Release',
      targetFloor: target,
      palletId
    };
  }

  if (parkingSystem.Type === 'Puzzle') {
    const segmentSeconds = calculatePuzzleSegmentSeconds({
      parkingSystem,
      targetFloor: target,
      isBelowGround: false
    });
    return {
      segmentSeconds,
      totalEstimatedSeconds: prevTotal + segmentSeconds,
      endLiftFloor: requestType === 'Parking' ? target : 0,
      endPalletTypeOnLift: requestType === 'Release' ? type : null,
      endPalletId: requestType === 'Release' ? palletId : null,
      endLastRequestType: requestType,
      targetFloor: target,
      palletId
    };
  }

  let segmentSeconds = 0;
  let endLiftFloor = 0;
  let endPalletTypeOnLift = null;
  let endPalletId = null;
  let resolvedPalletId = palletId;
  let resolvedTargetFloor = target;

  if (requestType === 'Parking') {
    const sameTypeOnLift =
      liftHasPallet && type && prev.palletTypeOnLift && prev.palletTypeOnLift === type;

    if (sameTypeOnLift) {
      // Same type on lift (at 0): park that pallet home — traverse 1 — path 0 → H
      const home = await resolveStoreHomePallet(
        prev,
        palletHomeFloor != null ? palletHomeFloor : target || 1,
        transaction
      );
      resolvedTargetFloor = home.floor;
      resolvedPalletId = home.palletId || prev.palletId || palletId;
      segmentSeconds = timeForPath([0, home.floor], 1, home.tt);
      endLiftFloor = home.floor;
      endPalletTypeOnLift = null;
      endPalletId = null;
    } else if (liftHasPallet) {
      // Different type on lift (at 0): store S, get E, ground, park — traverse 3
      // path: 0 → S → E → 0 → E ; side TT from destination empty E
      const home = await resolveStoreHomePallet(prev, 1, transaction);
      const empty = await findNearestEmptyPallet({
        projectId: projectId || parkingSystem.ProjectId,
        parkingSystemId: parkingSystemId || parkingSystem.Id,
        carType: type,
        liftFloor: home.floor,
        excludePalletIds,
        transaction
      });
      const emptyFloor = empty ? resolvePalletFloor(empty) : target || 1;
      const targetTt = empty && empty.TT != null ? Number(empty.TT) : null;
      resolvedTargetFloor = emptyFloor;
      resolvedPalletId = empty ? empty.Id : palletId;
      segmentSeconds = timeForPath(
        [0, home.floor, emptyFloor, 0, emptyFloor],
        3,
        targetTt
      );
      endLiftFloor = emptyFloor;
      endPalletTypeOnLift = null;
      endPalletId = null;
    } else {
      // No pallet on lift (any floor L): nearest E, ground, park — traverse 2
      // path: L → E → 0 → E ; side TT from destination empty E
      const empty = await findNearestEmptyPallet({
        projectId: projectId || parkingSystem.ProjectId,
        parkingSystemId: parkingSystemId || parkingSystem.Id,
        carType: type,
        liftFloor: startFloor,
        excludePalletIds,
        transaction
      });
      const emptyFloor = empty ? resolvePalletFloor(empty) : target || 1;
      const targetTt = empty && empty.TT != null ? Number(empty.TT) : null;
      resolvedTargetFloor = emptyFloor;
      resolvedPalletId = empty ? empty.Id : palletId;
      segmentSeconds = timeForPath(
        [startFloor, emptyFloor, 0, emptyFloor],
        2,
        targetTt
      );
      endLiftFloor = emptyFloor;
      endPalletTypeOnLift = null;
      endPalletId = null;
    }
  } else {
    // Release — side TT from retrieval target pallet (PalletDetails.TT)
    const targetTt = await resolvePalletTtById(palletId, transaction);
    if (liftHasPallet) {
      // Pallet on lift at 0: store P, fetch T, ground — traverse 2 — path 0 → P → T → 0
      const home = await resolveStoreHomePallet(prev, 1, transaction);
      resolvedTargetFloor = target;
      segmentSeconds = timeForPath([0, home.floor, target, 0], 2, targetTt);
    } else {
      // No pallet: any floor F → T → 0 — traverse 1
      resolvedTargetFloor = target;
      segmentSeconds = timeForPath([startFloor, target, 0], 1, targetTt);
    }
    endLiftFloor = 0;
    endPalletTypeOnLift = type;
    endPalletId = palletId;
  }

  return {
    segmentSeconds: Math.round(segmentSeconds),
    totalEstimatedSeconds: Math.round(prevTotal + segmentSeconds),
    endLiftFloor,
    endPalletTypeOnLift,
    endPalletId,
    endLastRequestType: requestType,
    targetFloor: resolvedTargetFloor,
    palletId: resolvedPalletId
  };
};

const stateFromEstimateResult = (result) => ({
  liftFloor: result.endLiftFloor,
  // Product: after release, pallet on lift at ground; after park, empty at parked floor
  palletTypeOnLift: result.endPalletTypeOnLift,
  palletId: result.endPalletId,
  lastRequestType: result.endLastRequestType,
  totalEstimatedSeconds: result.totalEstimatedSeconds
});

module.exports = {
  normalizeType,
  countsForTraverse,
  sumFloorDistance,
  timeForPath,
  resolvePalletFloor,
  findNearestEmptyPallet,
  emptyLiftState,
  seedStateFromLiftLive,
  calculatePuzzleSegmentSeconds,
  calculateRequestEstimatedTime,
  stateFromEstimateResult
};
