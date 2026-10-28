const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Notification = sequelize.define(
  'Notification',
  {
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
    Type: {
      type: DataTypes.STRING(64),
      allowNull: false
    },
    Title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    Body: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    DataJson: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    IsRead: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
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
    tableName: 'notifications',
    timestamps: true,
    createdAt: 'CreatedAt',
    updatedAt: 'UpdatedAt'
  }
);

module.exports = Notification;
