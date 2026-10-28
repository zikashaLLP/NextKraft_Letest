const { User, Customer, Operator } = require('../models/associations');
const { generateToken } = require('../utils');
const {
  addFcmToken,
  removeFcmToken,
  serializeFcmTokens
} = require('../utils/fcmTokens');
const customerService = require('./customer.service');
const operatorService = require('./operator.service');

// Sign Up Service
const signUp = async (username, password) => {
  // Check if user already exists
  const existingUser = await User.findOne({ where: { Username: username } });
  
  if (existingUser) {
    throw new Error('Username already exists');
  }

  // Create new user
  const user = await User.create({
    Username: username,
    Password: password,
    Role: 'customer'
  });

  // Generate token
  const token = generateToken(user.Id, user.Role);

  return {
    user: {
      id: user.Id,
      username: user.Username,
      role: user.Role,
      createdAt: user.CreatedAt,
      updatedAt: user.UpdatedAt
    },
    token
  };
};

/**
 * Universal Login Service
 * Works for all user types: admin, operator, and customer
 * Returns JWT token containing userId and role in payload
 */
const login = async (username, password, fcmToken = null) => {
  // Find user by username (works for any role: admin, operator, customer)
  const user = await User.findOne({ where: { Username: username } });
  
  if (!user) {
    throw new Error('Invalid username or password');
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  
  if (!isPasswordValid) {
    throw new Error('Invalid username or password');
  }

  // Append device FCM token (multi-device array; do not overwrite other devices)
  if (fcmToken) {
    const tokens = addFcmToken(user.FcmToken, fcmToken);
    await user.update({ FcmToken: serializeFcmTokens(tokens) });
  }

  // Generate JWT token with userId and role in payload
  const token = generateToken(user.Id, user.Role);

  return {
    user: {
      id: user.Id,
      username: user.Username,
      role: user.Role,
      createdAt: user.CreatedAt,
      updatedAt: user.UpdatedAt
    },
    token // JWT token contains { userId: user.Id, role: user.Role }
  };
};

/**
 * Logout — remove this device's FCM token from the user's array (other devices keep theirs).
 */
const logout = async (userId, fcmToken = null) => {
  const user = await User.findByPk(userId, { attributes: ['Id', 'FcmToken'] });
  if (!user) {
    throw new Error('User not found');
  }
  if (fcmToken) {
    const tokens = removeFcmToken(user.FcmToken, fcmToken);
    await user.update({ FcmToken: serializeFcmTokens(tokens) });
  }
  return { success: true };
};

/**
 * Profile by users.Id — dispatches to customer/operator profile services or returns admin user only.
 * Access: admin (any); operator (self or customers in their project); customer (self only).
 */
const getProfileByUserId = async (targetUserId, requester) => {
  const user = await User.findByPk(targetUserId, {
    attributes: ['Id', 'Username', 'Role', 'CreatedAt', 'UpdatedAt']
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (requester.role === 'customer') {
    if (requester.id !== targetUserId) {
      throw new Error('Access denied. You can only view your own profile');
    }
  } else if (requester.role === 'operator') {
    if (requester.id !== targetUserId) {
      const operator = await Operator.findOne({
        where: { UserId: requester.id }
      });
      if (!operator) {
        throw new Error('Operator profile not found');
      }
      if (!operator.ProjectId) {
        throw new Error('Operator is not assigned to any project');
      }
      if (user.Role !== 'customer') {
        throw new Error('Access denied. Operators can only view customer profiles in their project');
      }
      const customer = await Customer.findOne({
        where: { UserId: targetUserId }
      });
      if (!customer || customer.ProjectId !== operator.ProjectId) {
        throw new Error('Access denied. Customer is not in your project scope');
      }
    }
  }

  if (user.Role === 'customer') {
    return customerService.getCustomerProfile(targetUserId);
  }
  if (user.Role === 'operator') {
    return operatorService.getOperatorProfile(targetUserId);
  }

  return {
    user: {
      id: user.Id,
      username: user.Username,
      role: user.Role,
      createdAt: user.CreatedAt,
      updatedAt: user.UpdatedAt
    }
  };
};

module.exports = {
  signUp,
  login,
  logout,
  getProfileByUserId
};


