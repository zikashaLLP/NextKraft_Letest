const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Request = sequelize.define('Request', {
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
  PalletAllotmentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'PalletDetails',
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
  EstimatedTime: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  /** When EstimatedTime was anchored (queue / pre-accept). */
  EstimatedTimeAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  /** Post-accept countdown duration (seconds); customer Accepted timer uses this. */
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
  tableName: 'requests',
  timestamps: true,
  createdAt: 'CreatedAt',
  updatedAt: 'UpdatedAt'
});

module.exports = Request;

