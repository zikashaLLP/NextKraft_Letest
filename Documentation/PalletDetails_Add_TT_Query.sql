-- Slot TT from Omron FloorMapping (DregisterTTValue). Used by queue ETA when TT = 11 (+45s side).
-- Safe to re-run: adds column only if missing (MySQL 8+ / MariaDB — use IF NOT EXISTS where supported).

ALTER TABLE PalletDetails
  ADD COLUMN TT INT NULL DEFAULT NULL
  COMMENT 'Omron FloorMapping DregisterTTValue; 11 = side TT (+45s)';
