-- Foolproof SyncUUID sync: scope error/system logs + upsert by SyncUuid
-- Compatible with older MySQL (no DROP INDEX IF EXISTS / ADD COLUMN IF NOT EXISTS).
-- Uses information_schema + prepared statements. Run the whole script once in one session.
-- Replace YOUR_DATABASE_NAME below if needed, or keep DATABASE() when connected to the right DB.

-- ========== helpers: run each block while connected to the target schema ==========

-- ----- ERROR LOGS: add SyncUuid if missing -----
SET @db := DATABASE();

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE error_logs ADD COLUMN SyncUuid VARCHAR(64) NULL AFTER Id',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'error_logs' AND COLUMN_NAME = 'SyncUuid'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE error_logs ADD COLUMN ProjectId INT NULL AFTER PlcLogId',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'error_logs' AND COLUMN_NAME = 'ProjectId'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE error_logs ADD COLUMN ParkingSystemId INT NULL AFTER ProjectId',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'error_logs' AND COLUMN_NAME = 'ParkingSystemId'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE error_logs
SET SyncUuid = CONCAT('legacy-error_logs-', PlcLogId)
WHERE SyncUuid IS NULL OR SyncUuid = '';

ALTER TABLE error_logs
  MODIFY COLUMN SyncUuid VARCHAR(64) NOT NULL;

-- Drop old unique on PlcLogId only if present
SET @sql := (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE error_logs DROP INDEX uq_error_logs_plclogid',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'error_logs' AND INDEX_NAME = 'uq_error_logs_plclogid'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop Sequelize-named unique on SyncUuid if present (before adding uq_*)
SET @sql := (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE error_logs DROP INDEX SyncUuid',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'error_logs' AND INDEX_NAME = 'SyncUuid'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE error_logs ADD UNIQUE KEY uq_error_logs_syncuuid (SyncUuid)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'error_logs' AND INDEX_NAME = 'uq_error_logs_syncuuid'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE error_logs ADD KEY idx_error_logs_ps_plclogid (ParkingSystemId, PlcLogId)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'error_logs' AND INDEX_NAME = 'idx_error_logs_ps_plclogid'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE error_logs ADD KEY idx_error_logs_projectid (ProjectId)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'error_logs' AND INDEX_NAME = 'idx_error_logs_projectid'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE error_logs ADD KEY idx_error_logs_parkingsystemid (ParkingSystemId)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'error_logs' AND INDEX_NAME = 'idx_error_logs_parkingsystemid'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== SYSTEM LOGS ==========

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE system_logs ADD COLUMN SyncUuid VARCHAR(64) NULL AFTER Id',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'system_logs' AND COLUMN_NAME = 'SyncUuid'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE system_logs ADD COLUMN ProjectId INT NULL AFTER PlcLogId',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'system_logs' AND COLUMN_NAME = 'ProjectId'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE system_logs ADD COLUMN ParkingSystemId INT NULL AFTER ProjectId',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'system_logs' AND COLUMN_NAME = 'ParkingSystemId'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE system_logs
SET SyncUuid = CONCAT('legacy-system_logs-', PlcLogId)
WHERE SyncUuid IS NULL OR SyncUuid = '';

ALTER TABLE system_logs
  MODIFY COLUMN SyncUuid VARCHAR(64) NOT NULL;

SET @sql := (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE system_logs DROP INDEX uq_system_logs_plclogid',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'system_logs' AND INDEX_NAME = 'uq_system_logs_plclogid'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE system_logs DROP INDEX SyncUuid',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'system_logs' AND INDEX_NAME = 'SyncUuid'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE system_logs ADD UNIQUE KEY uq_system_logs_syncuuid (SyncUuid)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'system_logs' AND INDEX_NAME = 'uq_system_logs_syncuuid'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE system_logs ADD KEY idx_system_logs_ps_plclogid (ParkingSystemId, PlcLogId)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'system_logs' AND INDEX_NAME = 'idx_system_logs_ps_plclogid'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE system_logs ADD KEY idx_system_logs_projectid (ProjectId)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'system_logs' AND INDEX_NAME = 'idx_system_logs_projectid'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE system_logs ADD KEY idx_system_logs_parkingsystemid (ParkingSystemId)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'system_logs' AND INDEX_NAME = 'idx_system_logs_parkingsystemid'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
