const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CarAllotSyncLedger = sequelize.define(
  'CarAllotSyncLedger',
  {
    Id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    SyncUuid: {
      type: DataTypes.STRING(64),
      allowNull: false
    },
    OmronHistoryId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Phase: {
      type: DataTypes.ENUM('parking', 'retrieval'),
      allowNull: false
    },
    ParkingSystemId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    ProjectId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    PalletId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    CarId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    UserId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    ParkingRequestId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'applied'
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
  },
  {
    tableName: 'car_allot_sync_ledgers',
    timestamps: true,
    createdAt: 'CreatedAt',
    updatedAt: 'UpdatedAt',
    indexes: [
      {
        unique: true,
        fields: ['SyncUuid', 'Phase'],
        name: 'uq_car_allot_sync_ledgers_syncuuid_phase'
      },
      { fields: ['ParkingSystemId'], name: 'idx_car_allot_sync_ledgers_ps' },
      { fields: ['ProjectId'], name: 'idx_car_allot_sync_ledgers_project' }
    ]
  }
);

module.exports = CarAllotSyncLedger;
