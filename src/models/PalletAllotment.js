const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { CAR_TYPE_VALUES } = require('../utils/constant');

const PalletAllotment = sequelize.define('PalletAllotment', {
  Id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  UserId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  ParkingSystemId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'parking_system',
      key: 'Id'
    }
  },
  ProjectId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'projects',
      key: 'Id'
    }
  },
  Level: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Level above ground (used for both Tower and Puzzle)'
  },
  LevelBelowGround: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Level below ground (used for Puzzle parking only, NULL for Tower)'
  },
  Column: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  UserGivenPalletNumber: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  CarId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'cars',
      key: 'Id'
    }
  },
  // Physical pallet/slot type from PLC sync only (bulk-update-pallet-numbers). Not cleared on park/release.
  CarType: {
    type: DataTypes.ENUM(...CAR_TYPE_VALUES),
    allowNull: true,
    defaultValue: null
  },
  /**
   * Slot TT register (Omron FloorMapping DregisterTTValue). Synced on bulk pallet-number sync;
   * refreshed on park-car / release-parked-car when operator sends live TT. ETA: TT===11 → +45s.
   */
  TT: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null
  },
  Status: {
    type: DataTypes.ENUM('Assigned', 'Released'),
    defaultValue: 'Assigned'
  },
  CreatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  UpdatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'PalletDetails',
  timestamps: true,
  createdAt: 'CreatedAt',
  updatedAt: 'UpdatedAt'
});

module.exports = PalletAllotment;

