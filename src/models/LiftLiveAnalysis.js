const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LIFT_PALLET_TYPE_VALUES = Object.freeze(['None', 'Sedan', 'SUV']);

const LiftLiveAnalysis = sequelize.define(
  'LiftLiveAnalysis',
  {
    Id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    ProjectId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'projects',
        key: 'Id'
      }
    },
    ParkingSystemId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: {
        model: 'parking_system',
        key: 'Id'
      }
    },
    PalletTypeOnLift: {
      type: DataTypes.ENUM(...LIFT_PALLET_TYPE_VALUES),
      allowNull: false,
      defaultValue: 'None'
    },
    PalletId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'PalletDetails',
        key: 'Id'
      }
    },
    NextPalletTypeOnLift: {
      type: DataTypes.ENUM(...LIFT_PALLET_TYPE_VALUES),
      allowNull: false,
      defaultValue: 'None'
    },
    NextPalletId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'PalletDetails',
        key: 'Id'
      }
    },
    LiftFloor: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '0 = ground'
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
    tableName: 'LiftLiveAnalysis',
    timestamps: true,
    createdAt: 'CreatedAt',
    updatedAt: 'UpdatedAt',
    indexes: [
      {
        unique: true,
        fields: ['ParkingSystemId'],
        name: 'uq_lift_live_analysis_parking_system'
      }
    ]
  }
);

LiftLiveAnalysis.LIFT_PALLET_TYPE_VALUES = LIFT_PALLET_TYPE_VALUES;

module.exports = LiftLiveAnalysis;
