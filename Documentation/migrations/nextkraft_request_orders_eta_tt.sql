-- =============================================================================
-- NextKraft: RequestOrders + queue ETA fields + LiftLiveAnalysis + PalletDetails.TT
-- Idempotent (safe to re-run). Connect to the target schema first.
-- =============================================================================

SET @db := DATABASE();

-- -----------------------------------------------------------------------------
-- 1) LiftLiveAnalysis — seed lift state for queue ETA
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS LiftLiveAnalysis (
  Id INT NOT NULL AUTO_INCREMENT,
  ProjectId INT NOT NULL,
  ParkingSystemId INT NOT NULL,
  PalletTypeOnLift ENUM('None', 'Sedan', 'SUV') NOT NULL DEFAULT 'None',
  PalletId INT NULL,
  NextPalletTypeOnLift ENUM('None', 'Sedan', 'SUV') NOT NULL DEFAULT 'None',
  NextPalletId INT NULL,
  LiftFloor INT NOT NULL DEFAULT 0 COMMENT '0 = ground',
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY uq_lift_live_analysis_parking_system (ParkingSystemId),
  KEY idx_lift_live_analysis_project (ProjectId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 2) RequestOrders — shared parking + release queue order
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS RequestOrders (
  Id INT NOT NULL AUTO_INCREMENT,
  ProjectId INT NOT NULL,
  ParkingSystemId INT NOT NULL,
  RequestType ENUM('Parking', 'Release') NOT NULL,
  RequestId INT NOT NULL,
  OrderNumber INT NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY uq_request_orders_ps_order (ParkingSystemId, OrderNumber),
  UNIQUE KEY uq_request_orders_ps_type_id (ParkingSystemId, RequestType, RequestId),
  KEY idx_request_orders_ps_order (ParkingSystemId, OrderNumber),
  KEY idx_request_orders_project (ProjectId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- Helper: add column if missing
-- Usage pattern below for parking_requests / requests / PalletDetails
-- -----------------------------------------------------------------------------

-- 3a) parking_requests.EstimatedTime
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE parking_requests ADD COLUMN EstimatedTime INT NOT NULL DEFAULT 0 COMMENT ''Queue / pre-accept cumulative ETA seconds''',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parking_requests' AND COLUMN_NAME = 'EstimatedTime'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3b) parking_requests.EstimatedTimeAt
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE parking_requests ADD COLUMN EstimatedTimeAt DATETIME NULL COMMENT ''When EstimatedTime was anchored''',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parking_requests' AND COLUMN_NAME = 'EstimatedTimeAt'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3c) parking_requests.AfterAcceptTimer
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE parking_requests ADD COLUMN AfterAcceptTimer INT NOT NULL DEFAULT 0 COMMENT ''Post-accept countdown seconds''',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parking_requests' AND COLUMN_NAME = 'AfterAcceptTimer'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3d) parking_requests.AcceptedAt
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE parking_requests ADD COLUMN AcceptedAt DATETIME NULL COMMENT ''Accept countdown anchor''',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parking_requests' AND COLUMN_NAME = 'AcceptedAt'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 4) requests — ETA / accept timer (EstimatedTime often already exists)
-- -----------------------------------------------------------------------------

-- 4a) requests.EstimatedTime
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE requests ADD COLUMN EstimatedTime INT NOT NULL DEFAULT 0 COMMENT ''Queue / pre-accept cumulative ETA seconds''',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'requests' AND COLUMN_NAME = 'EstimatedTime'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4b) requests.EstimatedTimeAt
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE requests ADD COLUMN EstimatedTimeAt DATETIME NULL COMMENT ''When EstimatedTime was anchored''',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'requests' AND COLUMN_NAME = 'EstimatedTimeAt'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4c) requests.AfterAcceptTimer
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE requests ADD COLUMN AfterAcceptTimer INT NOT NULL DEFAULT 0 COMMENT ''Post-accept countdown seconds (release Accept)''',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'requests' AND COLUMN_NAME = 'AfterAcceptTimer'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4d) requests.AcceptedAt
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE requests ADD COLUMN AcceptedAt DATETIME NULL COMMENT ''Accept countdown anchor''',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'requests' AND COLUMN_NAME = 'AcceptedAt'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 5) PalletDetails.TT — Omron FloorMapping DregisterTTValue (11 → +45s side TT)
-- -----------------------------------------------------------------------------
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE PalletDetails ADD COLUMN TT INT NULL DEFAULT NULL COMMENT ''Omron FloorMapping DregisterTTValue; 11 = side TT (+45s)''',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'PalletDetails' AND COLUMN_NAME = 'TT'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 6) PalletDetails.CarType — PLC slot type (if missing on older DBs)
-- -----------------------------------------------------------------------------
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE PalletDetails ADD COLUMN CarType ENUM(''Sedan'', ''SUV'') NULL DEFAULT NULL COMMENT ''Physical slot type from PLC bulk sync''',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'PalletDetails' AND COLUMN_NAME = 'CarType'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
