const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AppConfig = sequelize.define(
  'AppConfig',
  {
    Id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    Key: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true
    },
    Value: {
      type: DataTypes.TEXT,
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
    tableName: 'app_configs',
    timestamps: true,
    createdAt: 'CreatedAt',
    updatedAt: 'UpdatedAt',
    indexes: [{ unique: true, fields: ['Key'], name: 'uq_app_configs_key' }]
  }
);

module.exports = AppConfig;
