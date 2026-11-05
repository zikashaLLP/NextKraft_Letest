const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const REQUEST_ORDER_TYPES = Object.freeze(['Parking', 'Release']);

const RequestOrders = sequelize.define(
  'RequestOrders',
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
      references: {
        model: 'parking_system',
        key: 'Id'
      }
    },
    RequestType: {
      type: DataTypes.ENUM(...REQUEST_ORDER_TYPES),
      allowNull: false
    },
    RequestId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    OrderNumber: {
      type: DataTypes.INTEGER,
      allowNull: false
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
    tableName: 'RequestOrders',
    timestamps: true,
    createdAt: 'CreatedAt',
    updatedAt: 'UpdatedAt',
    indexes: [
      {
        unique: true,
        fields: ['ParkingSystemId', 'OrderNumber'],
        name: 'uq_request_orders_ps_order'
      },
      {
        unique: true,
        fields: ['ParkingSystemId', 'RequestType', 'RequestId'],
        name: 'uq_request_orders_ps_type_id'
      },
      {
        fields: ['ParkingSystemId', 'OrderNumber'],
        name: 'idx_request_orders_ps_order'
      }
    ]
  }
);

RequestOrders.REQUEST_ORDER_TYPES = REQUEST_ORDER_TYPES;

module.exports = RequestOrders;
