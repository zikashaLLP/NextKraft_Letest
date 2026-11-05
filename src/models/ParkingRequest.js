const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ParkingRequest = sequelize.define('ParkingRequest', {
  Id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  UserId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
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
  ParkingSystemId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'parking_system',
      key: 'Id'
    }
  },
  CarId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'cars',
      key: 'Id'
    }
  },
  Status: {
    type: DataTypes.ENUM('Pending', 'Accepted', 'Queued', 'Completed', 'Cancelled'),
    defaultValue: 'Pending'
  },
  /** Queue / pre-accept cumulative ETA (seconds) from last recalculation. */
  EstimatedTime: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  /** When EstimatedTime was anchored. */
  EstimatedTimeAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  /** Post-accept countdown duration (seconds). */
  AfterAcceptTimer: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  /** Accept countdown anchor. */
  AcceptedAt: {
    type: DataTypes.DATE,
    allowNull: true
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
  tableName: 'parking_requests',
  timestamps: true,
  createdAt: 'CreatedAt',
  updatedAt: 'UpdatedAt'
});

module.exports = ParkingRequest;


