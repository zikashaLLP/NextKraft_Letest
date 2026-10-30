CREATE DATABASE IF NOT EXISTS nextkraft;
USE nextkraft;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

------------------------------------------------------------
-- USER TABLE
------------------------------------------------------------
CREATE TABLE users (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Username VARCHAR(100) NOT NULL UNIQUE,
    Password VARCHAR(255) NOT NULL,
    Role ENUM('admin', 'operator', 'customer') NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


------------------------------------------------------------
-- PROJECT TABLE
------------------------------------------------------------
CREATE TABLE projects (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    ProjectName VARCHAR(150) NOT NULL UNIQUE,
    SocietyName VARCHAR(150) NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


------------------------------------------------------------
-- CUSTOMER TABLE
------------------------------------------------------------
CREATE TABLE customers (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    FirstName VARCHAR(100) NOT NULL,
    LastName VARCHAR(100),
    Email VARCHAR(150),
    MobileNumber VARCHAR(20),
    UserId INT NOT NULL,
    ProjectId INT NOT NULL,
    ParkingSystemId INT NULL,
    FlatNumber VARCHAR(50),
    Status ENUM('Approved', 'Rejected', 'Pending') DEFAULT 'Pending',
    ApprovedAt DATETIME NULL,
    ApprovedBy INT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (UserId) REFERENCES users(Id),
    FOREIGN KEY (ProjectId) REFERENCES projects(Id),
    FOREIGN KEY (ParkingSystemId) REFERENCES parking_system(Id),
    FOREIGN KEY (ApprovedBy) REFERENCES users(Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


------------------------------------------------------------
-- OPERATOR TABLE
------------------------------------------------------------
CREATE TABLE operators (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    FirstName VARCHAR(100) NOT NULL,
    LastName VARCHAR(100),
    MobileNumber VARCHAR(20),
    Email VARCHAR(150),
    UserId INT NOT NULL,
    Status ENUM('Approved', 'Rejected', 'Pending') DEFAULT 'Pending',
    ProjectId INT NOT NULL,
    ParkingSystemId INT NULL,
    HasPalletPower BOOLEAN DEFAULT 0,
    ApprovedAt DATETIME NULL,
    ApprovedBy INT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (UserId) REFERENCES users(Id),
    FOREIGN KEY (ProjectId) REFERENCES projects(Id),
    FOREIGN KEY (ParkingSystemId) REFERENCES parking_system(Id),
    FOREIGN KEY (ApprovedBy) REFERENCES users(Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


------------------------------------------------------------
-- PARKING SYSTEM TABLE
------------------------------------------------------------
CREATE TABLE parking_system (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    WingName VARCHAR(100),
    ProjectId INT NOT NULL,
    Type ENUM('Tower', 'Puzzle') NOT NULL,
    Level INT NOT NULL,
    `Column` INT NOT NULL,
    TotalNumberOfPallet INT NOT NULL,
    
    TimeForEachLevel INT DEFAULT 0,  -- seconds
    TimeForHorizontalMove INT DEFAULT 0, -- seconds
    
    Status ENUM(
        'Idle', 'LiftUp', 'LiftDown', 'LeftTaking', 'LeftLeaving',
        'RightTaking', 'RightLeaving', 'TT_0_180', 'TT_180_0',
        'DoorOpen', 'DoorClose'
    ) DEFAULT 'Idle',
    
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (ProjectId) REFERENCES projects(Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


------------------------------------------------------------
-- CAR TABLE
------------------------------------------------------------
CREATE TABLE cars (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    UserId INT NOT NULL,
    CarType ENUM('Sedan', 'SUV') NULL,
    CarModel VARCHAR(100),
    CarCompany VARCHAR(100),
    CarNumber VARCHAR(50),
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (UserId) REFERENCES users(Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


------------------------------------------------------------
-- PALLET DETAILS TABLE
------------------------------------------------------------
CREATE TABLE PalletDetails (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    UserId INT NOT NULL DEFAULT 0,
    ParkingSystemId INT NOT NULL,
    ProjectId INT NOT NULL,
    Level INT NOT NULL,
    `Column` INT NOT NULL,
    UserGivenPalletNumber VARCHAR(50),
    CarId INT NULL,
    CarType ENUM('Sedan', 'SUV') NULL,
    Status ENUM('Assigned', 'Released') DEFAULT 'Released',
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (ParkingSystemId) REFERENCES parking_system(Id),
    FOREIGN KEY (ProjectId) REFERENCES projects(Id),
    FOREIGN KEY (CarId) REFERENCES cars(Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


------------------------------------------------------------
-- REQUEST QUEUE TABLE (Active Requests)
------------------------------------------------------------
CREATE TABLE request_queue (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    UserId INT NOT NULL,
    PalletAllotmentId INT NOT NULL,
    OperatorId INT NULL,
    
    Status ENUM('Pending', 'Accepted', 'Queued', 'Completed', 'Cancelled') DEFAULT 'Pending',
    EstimatedTime INT DEFAULT 0, -- seconds
    
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (UserId) REFERENCES users(Id),
    FOREIGN KEY (PalletAllotmentId) REFERENCES PalletDetails(Id),
    FOREIGN KEY (OperatorId) REFERENCES operators(Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


------------------------------------------------------------
-- REQUEST TABLE (History of Completed/Cancelled Requests)
------------------------------------------------------------
CREATE TABLE requests (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    UserId INT NOT NULL,
    PalletAllotmentId INT NOT NULL,
    OperatorId INT NULL,
    
    Status ENUM('Pending', 'Accepted', 'Queued', 'Completed', 'Cancelled') DEFAULT 'Pending',
    EstimatedTime INT DEFAULT 0,
    
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (UserId) REFERENCES users(Id),
    FOREIGN KEY (PalletAllotmentId) REFERENCES PalletDetails(Id),
    FOREIGN KEY (OperatorId) REFERENCES operators(Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


------------------------------------------------------------
-- PARKING REQUEST TABLE
------------------------------------------------------------
CREATE TABLE parking_requests (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    UserId INT NOT NULL,
    ProjectId INT NOT NULL,
    ParkingSystemId INT NOT NULL,
    CarId INT NOT NULL,
    
    Status ENUM('Pending', 'Accepted', 'Queued', 'Completed', 'Cancelled') DEFAULT 'Pending',
    
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (UserId) REFERENCES users(Id),
    FOREIGN KEY (ProjectId) REFERENCES projects(Id),
    FOREIGN KEY (ParkingSystemId) REFERENCES parking_system(Id),
    FOREIGN KEY (CarId) REFERENCES cars(Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


------------------------------------------------------------
-- ERROR LOGS (PLC error log mirror; upsert key = SyncUuid)
------------------------------------------------------------
CREATE TABLE error_logs (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    SyncUuid VARCHAR(64) NOT NULL,
    PlcLogId INT NOT NULL,
    ProjectId INT NULL,
    ParkingSystemId INT NULL,
    Type VARCHAR(255) NOT NULL DEFAULT '',
    LogKey VARCHAR(255) NOT NULL,
    LogValue TEXT NOT NULL,
    Message TEXT NOT NULL DEFAULT '',
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_error_logs_syncuuid (SyncUuid),
    KEY idx_error_logs_ps_plclogid (ParkingSystemId, PlcLogId),
    KEY idx_error_logs_projectid (ProjectId),
    KEY idx_error_logs_parkingsystemid (ParkingSystemId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


------------------------------------------------------------
-- SYSTEM LOGS (PLC system log mirror; upsert key = SyncUuid)
------------------------------------------------------------
CREATE TABLE system_logs (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    SyncUuid VARCHAR(64) NOT NULL,
    PlcLogId INT NOT NULL,
    ProjectId INT NULL,
    ParkingSystemId INT NULL,
    Type VARCHAR(255) NOT NULL DEFAULT '',
    LogKey VARCHAR(255) NOT NULL,
    LogValue TEXT NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_system_logs_syncuuid (SyncUuid),
    KEY idx_system_logs_ps_plclogid (ParkingSystemId, PlcLogId),
    KEY idx_system_logs_projectid (ProjectId),
    KEY idx_system_logs_parkingsystemid (ParkingSystemId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
