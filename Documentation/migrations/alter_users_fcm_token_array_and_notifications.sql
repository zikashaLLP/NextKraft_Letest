-- Normalize users.FcmToken to a JSON array string (legacy single token → ["token"]).
UPDATE users
SET FcmToken = CASE
  WHEN FcmToken IS NULL OR TRIM(FcmToken) = '' THEN '[]'
  WHEN TRIM(FcmToken) LIKE '[%' THEN FcmToken
  ELSE CONCAT('["', REPLACE(FcmToken, '"', '\\"'), '"]')
END;

-- In-app notification inbox (one row per push sent).
CREATE TABLE IF NOT EXISTS notifications (
  Id INT NOT NULL AUTO_INCREMENT,
  UserId INT NOT NULL,
  Type VARCHAR(64) NOT NULL,
  Title VARCHAR(255) NOT NULL,
  Body TEXT NOT NULL,
  DataJson TEXT NULL,
  IsRead TINYINT(1) NOT NULL DEFAULT 0,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  KEY idx_notifications_user_created (UserId, CreatedAt),
  KEY idx_notifications_user_read (UserId, IsRead),
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (UserId) REFERENCES users (Id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
