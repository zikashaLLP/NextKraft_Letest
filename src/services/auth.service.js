const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op, fn, col, where } = require('sequelize');
const { User, Customer, Operator, PasswordResetOtp } = require('../models/associations');
const { generateToken } = require('../utils');
const {
  addFcmToken,
  removeFcmToken,
  serializeFcmTokens
} = require('../utils/fcmTokens');
const customerService = require('./customer.service');
const operatorService = require('./operator.service');
const emailService = require('./email.service');
const config = require('../config/config');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const findAccountByEmail = async (email, role = null) => {
  const normalized = normalizeEmail(email);
  const emailWhere = where(fn('LOWER', col('Email')), normalized);

  const loadCustomer = async () => {
    const customer = await Customer.findOne({
      where: emailWhere,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['Id', 'Username', 'Role', 'CreatedAt', 'UpdatedAt']
        }
      ]
    });
    if (!customer || !customer.user || customer.user.Role !== 'customer') {
      return null;
    }
    return {
      role: 'customer',
      userId: customer.user.Id,
      email: customer.Email,
      profileLoader: () => customerService.getCustomerProfile(customer.user.Id)
    };
  };

  const loadOperator = async () => {
    const operator = await Operator.findOne({
      where: emailWhere,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['Id', 'Username', 'Role', 'CreatedAt', 'UpdatedAt']
        }
      ]
    });
    if (!operator || !operator.user || operator.user.Role !== 'operator') {
      return null;
    }
    return {
      role: 'operator',
      userId: operator.user.Id,
      email: operator.Email,
      profileLoader: () => operatorService.getOperatorProfile(operator.user.Id)
    };
  };

  if (role === 'customer') {
    return loadCustomer();
  }
  if (role === 'operator') {
    return loadOperator();
  }

  const [customerAccount, operatorAccount] = await Promise.all([loadCustomer(), loadOperator()]);
  if (customerAccount && operatorAccount) {
    throw new Error('Multiple accounts found for this email. Please specify role as customer or operator');
  }
  return customerAccount || operatorAccount;
};

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
 * Authenticated password change (customer / operator / admin).
 */
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const isValid = await user.comparePassword(currentPassword);
  if (!isValid) {
    throw new Error('Current password is incorrect');
  }

  if (currentPassword === newPassword) {
    throw new Error('New password must be different from current password');
  }

  await user.update({ Password: newPassword });

  return {
    user: {
      id: user.Id,
      username: user.Username,
      role: user.Role,
      updatedAt: user.UpdatedAt
    }
  };
};

/**
 * Request forgot-password OTP for customer or operator by email.
 */
const forgotPassword = async (email, role = null) => {
  const account = await findAccountByEmail(email, role);
  // Always return a generic success shape to avoid email enumeration,
  // but still throw for ambiguous multi-account matches above.
  if (!account) {
    return {
      email: normalizeEmail(email),
      role: role || null,
      otpSent: true,
      expiresInMinutes: config.passwordReset.otpTtlMinutes
    };
  }

  const cooldownMs = config.passwordReset.resendCooldownSeconds * 1000;
  const recent = await PasswordResetOtp.findOne({
    where: {
      Email: normalizeEmail(account.email),
      Role: account.role,
      ConsumedAt: null,
      CreatedAt: { [Op.gte]: new Date(Date.now() - cooldownMs) }
    },
    order: [['CreatedAt', 'DESC']]
  });

  if (recent) {
    throw new Error(
      `Please wait ${config.passwordReset.resendCooldownSeconds} seconds before requesting another OTP`
    );
  }

  // Invalidate previous unused OTPs for this account
  await PasswordResetOtp.update(
    { ConsumedAt: new Date() },
    {
      where: {
        Email: normalizeEmail(account.email),
        Role: account.role,
        ConsumedAt: null
      }
    }
  );

  const otp = String(crypto.randomInt(100000, 1000000));
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(
    Date.now() + config.passwordReset.otpTtlMinutes * 60 * 1000
  );

  await PasswordResetOtp.create({
    Email: normalizeEmail(account.email),
    Role: account.role,
    UserId: account.userId,
    OtpHash: otpHash,
    ExpiresAt: expiresAt,
    ConsumedAt: null
  });

  await emailService.sendPasswordResetOtpEmail({
    to: account.email,
    otp,
    role: account.role,
    expiresInMinutes: config.passwordReset.otpTtlMinutes
  });

  return {
    email: normalizeEmail(account.email),
    role: account.role,
    otpSent: true,
    expiresInMinutes: config.passwordReset.otpTtlMinutes
  };
};

/**
 * Verify forgot-password OTP, set new password, return profile + JWT.
 */
const verifyForgotPasswordOtp = async ({ email, otp, newPassword, role = null }) => {
  const account = await findAccountByEmail(email, role);
  if (!account) {
    throw new Error('Invalid email or OTP');
  }

  const otpRow = await PasswordResetOtp.findOne({
    where: {
      Email: normalizeEmail(account.email),
      Role: account.role,
      UserId: account.userId,
      ConsumedAt: null,
      ExpiresAt: { [Op.gt]: new Date() }
    },
    order: [['CreatedAt', 'DESC']]
  });

  if (!otpRow) {
    throw new Error('Invalid or expired OTP');
  }

  const otpMatches = await bcrypt.compare(String(otp).trim(), otpRow.OtpHash);
  if (!otpMatches) {
    throw new Error('Invalid or expired OTP');
  }

  const user = await User.findByPk(account.userId);
  if (!user) {
    throw new Error('User not found');
  }

  await user.update({ Password: newPassword });
  await otpRow.update({ ConsumedAt: new Date() });

  // Invalidate any other outstanding OTPs for this account
  await PasswordResetOtp.update(
    { ConsumedAt: new Date() },
    {
      where: {
        Email: normalizeEmail(account.email),
        Role: account.role,
        ConsumedAt: null,
        Id: { [Op.ne]: otpRow.Id }
      }
    }
  );

  const token = generateToken(user.Id, user.Role);
  const profile = await account.profileLoader();

  return {
    ...profile,
    token
  };
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
  changePassword,
  forgotPassword,
  verifyForgotPasswordOtp,
  getProfileByUserId
};
