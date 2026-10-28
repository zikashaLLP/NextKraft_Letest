const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  Id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  Username: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  Password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  Role: {
    type: DataTypes.ENUM('admin', 'operator', 'customer'),
    allowNull: false
  },
  /** JSON array of FCM device tokens, e.g. ["token1","token2"]. Legacy single strings still parse. */
  FcmToken: {
    type: DataTypes.TEXT,
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
  tableName: 'users',
  timestamps: true,
  createdAt: 'CreatedAt',
  updatedAt: 'UpdatedAt',
  hooks: {
    beforeCreate: async (user) => {
      if (user.Password) {
        user.Password = await bcrypt.hash(user.Password, 10);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('Password')) {
        user.Password = await bcrypt.hash(user.Password, 10);
      }
    }
  }
});

// Instance method to compare password
User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.Password);
};

module.exports = User;

