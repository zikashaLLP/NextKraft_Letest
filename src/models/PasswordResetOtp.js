const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PasswordResetOtp = sequelize.define(
  'PasswordResetOtp',
  {
    Id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    Email: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    Role: {
      type: DataTypes.ENUM('customer', 'operator'),
      allowNull: false
    },
    UserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'Id'
      }
    },
    OtpHash: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    ExpiresAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    ConsumedAt: {
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
  },
  {
    tableName: 'password_reset_otps',
    timestamps: true,
    createdAt: 'CreatedAt',
    updatedAt: 'UpdatedAt',
    indexes: [
      { fields: ['Email', 'Role'], name: 'idx_password_reset_otps_email_role' },
      { fields: ['UserId'], name: 'idx_password_reset_otps_user' },
      { fields: ['ExpiresAt'], name: 'idx_password_reset_otps_expires' }
    ]
  }
);

module.exports = PasswordResetOtp;
