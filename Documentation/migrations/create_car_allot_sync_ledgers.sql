-- Car allot SyncUuid ledger (idempotent parking-sync ACK, mirrors error/system log SyncUuid pattern)
-- Compatible with older MySQL (no CREATE TABLE IF NOT EXISTS assumptions beyond standard).
-- Run once while connected to the target schema.

SET @db := DATABASE();

CREATE TABLE IF NOT EXISTS car_allot_sync_ledgers (
  Id INT NOT NULL AUTO_INCREMENT,
  SyncUuid VARCHAR(64) NOT NULL,
  OmronHistoryId INT NULL,
  Phase ENUM('parking', 'retrieval') NOT NULL,
  ParkingSystemId INT NOT NULL,
  ProjectId INT NOT NULL,
  PalletId INT NULL,
  CarId INT NULL,
  UserId INT NULL,
  ParkingRequestId INT NULL,
  Status VARCHAR(32) NOT NULL DEFAULT 'applied',
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY uq_car_allot_sync_ledgers_syncuuid_phase (SyncUuid, Phase),
  KEY idx_car_allot_sync_ledgers_ps (ParkingSystemId),
  KEY idx_car_allot_sync_ledgers_project (ProjectId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Idempotent unique index if table existed without it
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE car_allot_sync_ledgers ADD UNIQUE KEY uq_car_allot_sync_ledgers_syncuuid_phase (SyncUuid, Phase)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'car_allot_sync_ledgers'
    AND INDEX_NAME = 'uq_car_allot_sync_ledgers_syncuuid_phase'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
