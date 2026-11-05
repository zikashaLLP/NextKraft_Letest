const { LiftLiveAnalysis } = require('../models/associations');

const getISTTime = () => {
  const now = new Date();
  const utcTime = now.getTime();
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(utcTime + istOffset);
};

/** Normalize to Sedan | SUV | null (None / empty). */
const normalizeLiftPalletType = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') {
    if (value === 1) return 'Sedan';
    if (value === 2) return 'SUV';
    return null;
  }
  const raw = String(value).trim().toLowerCase();
  if (raw === 'none' || raw === '0') return null;
  if (raw === 'sedan' || raw === '1') return 'Sedan';
  if (raw === 'suv' || raw === '2') return 'SUV';
  return null;
};

const toLiftTypeOrNone = (value) => normalizeLiftPalletType(value) || 'None';

const resolveLiftFloorFromPallet = (pallet) => {
  if (!pallet) return 0;
  if (pallet.Level != null) return Number(pallet.Level) || 0;
  if (pallet.LevelBelowGround != null) return Number(pallet.LevelBelowGround) || 0;
  return 0;
};

const ensureLiftLiveAnalysis = async (projectId, parkingSystemId, transaction = null) => {
  const existing = await LiftLiveAnalysis.findOne({
    where: { ParkingSystemId: parkingSystemId },
    transaction
  });
  if (existing) {
    return existing;
  }

  const istTime = getISTTime();
  try {
    return await LiftLiveAnalysis.create(
      {
        ProjectId: projectId,
        ParkingSystemId: parkingSystemId,
        PalletTypeOnLift: 'None',
        PalletId: null,
        NextPalletTypeOnLift: 'None',
        NextPalletId: null,
        LiftFloor: 0,
        CreatedAt: istTime,
        UpdatedAt: istTime
      },
      { transaction }
    );
  } catch (err) {
    // Race: another request created the row
    const again = await LiftLiveAnalysis.findOne({
      where: { ParkingSystemId: parkingSystemId },
      transaction
    });
    if (again) return again;
    throw err;
  }
};

const isLiftEmpty = (row) =>
  !row.PalletId && (row.PalletTypeOnLift === 'None' || !row.PalletTypeOnLift);

/**
 * Parking request Accepted (carIn).
 * Empty lift → set current to target. Same type → no change. Different type → queue Next*.
 */
const onParkAccepted = async ({
  projectId,
  parkingSystemId,
  targetPalletId,
  targetType,
  transaction = null
}) => {
  const type = toLiftTypeOrNone(targetType);
  if (type === 'None' || !targetPalletId) {
    return ensureLiftLiveAnalysis(projectId, parkingSystemId, transaction);
  }

  const row = await ensureLiftLiveAnalysis(projectId, parkingSystemId, transaction);
  const istTime = getISTTime();

  if (isLiftEmpty(row)) {
    await row.update(
      {
        PalletId: targetPalletId,
        PalletTypeOnLift: type,
        UpdatedAt: istTime
      },
      { transaction }
    );
    return row;
  }

  const currentType = toLiftTypeOrNone(row.PalletTypeOnLift);
  if (currentType === type) {
    return row;
  }

  await row.update(
    {
      NextPalletId: targetPalletId,
      NextPalletTypeOnLift: type,
      UpdatedAt: istTime
    },
    { transaction }
  );
  return row;
};

/**
 * Parking request Completed (parkCar / parking-sync park).
 * Clear lift pallet fields; set LiftFloor to parked pallet floor.
 */
const onParkCompleted = async ({
  projectId,
  parkingSystemId,
  liftFloor = 0,
  transaction = null
}) => {
  const row = await ensureLiftLiveAnalysis(projectId, parkingSystemId, transaction);
  const istTime = getISTTime();
  await row.update(
    {
      PalletTypeOnLift: 'None',
      PalletId: null,
      NextPalletTypeOnLift: 'None',
      NextPalletId: null,
      LiftFloor: Number.isFinite(Number(liftFloor)) ? Number(liftFloor) : 0,
      UpdatedAt: istTime
    },
    { transaction }
  );
  return row;
};

/**
 * Release request Accepted (callSpecificPallet via carOut).
 * Lift has pallet → queue Next*. Lift empty → set current to requested.
 */
const onReleaseAccepted = async ({
  projectId,
  parkingSystemId,
  requestedPalletId,
  requestedType,
  transaction = null
}) => {
  const type = toLiftTypeOrNone(requestedType);
  if (type === 'None' || !requestedPalletId) {
    return ensureLiftLiveAnalysis(projectId, parkingSystemId, transaction);
  }

  const row = await ensureLiftLiveAnalysis(projectId, parkingSystemId, transaction);
  const istTime = getISTTime();

  if (isLiftEmpty(row)) {
    await row.update(
      {
        PalletId: requestedPalletId,
        PalletTypeOnLift: type,
        UpdatedAt: istTime
      },
      { transaction }
    );
    return row;
  }

  await row.update(
    {
      NextPalletId: requestedPalletId,
      NextPalletTypeOnLift: type,
      UpdatedAt: istTime
    },
    { transaction }
  );
  return row;
};

/**
 * Release request Completed (releaseParkedCar / parking-sync retrieval).
 * Do not clear current lift pallet. LiftFloor = 0.
 * If Next* was queued, promote Next → current then clear Next*.
 */
const onReleaseCompleted = async ({ projectId, parkingSystemId, transaction = null }) => {
  const row = await ensureLiftLiveAnalysis(projectId, parkingSystemId, transaction);
  const istTime = getISTTime();

  const hasNext =
    row.NextPalletId != null ||
    (row.NextPalletTypeOnLift && row.NextPalletTypeOnLift !== 'None');

  if (hasNext) {
    await row.update(
      {
        PalletId: row.NextPalletId,
        PalletTypeOnLift: toLiftTypeOrNone(row.NextPalletTypeOnLift),
        NextPalletId: null,
        NextPalletTypeOnLift: 'None',
        LiftFloor: 0,
        UpdatedAt: istTime
      },
      { transaction }
    );
  } else {
    await row.update(
      {
        LiftFloor: 0,
        UpdatedAt: istTime
      },
      { transaction }
    );
  }

  return row;
};

const getLiftLiveAnalysisForOperator = async (projectId, parkingSystemId) => {
  const row = await ensureLiftLiveAnalysis(projectId, parkingSystemId);
  return {
    id: row.Id,
    projectId: row.ProjectId,
    parkingSystemId: row.ParkingSystemId,
    palletTypeOnLift: row.PalletTypeOnLift,
    palletId: row.PalletId,
    nextPalletTypeOnLift: row.NextPalletTypeOnLift,
    nextPalletId: row.NextPalletId,
    liftFloor: row.LiftFloor,
    updatedAt: row.UpdatedAt
  };
};

module.exports = {
  ensureLiftLiveAnalysis,
  normalizeLiftPalletType,
  toLiftTypeOrNone,
  resolveLiftFloorFromPallet,
  onParkAccepted,
  onParkCompleted,
  onReleaseAccepted,
  onReleaseCompleted,
  getLiftLiveAnalysisForOperator
};
