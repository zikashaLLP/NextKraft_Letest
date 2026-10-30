const authService = require('../services/auth.service');
const { successResponse, errorResponse } = require('../utils');

// Sign Up Controller
const signUp = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Force role to customer for all sign-ups
    const result = await authService.signUp(username, password);
    
    return successResponse(res, result, 'User registered successfully', 201);
  } catch (error) {
    console.error('Sign up error:', error);
    const statusCode = error.message === 'Username already exists' || 
                       error.message.includes('Invalid role') ? 400 : 500;
    return errorResponse(res, error.message || 'Registration failed', statusCode);
  }
};

/**
 * Universal Login Controller
 * Handles login for all user types (admin, operator, customer)
 * Returns JWT token with userId and role in payload
 */
const login = async (req, res) => {
  try {
    const { username, password, fcmToken } = req.body;
    
    // Login service works for all user roles
    // fcmToken is optional - if provided, it will be stored in user table
    const result = await authService.login(username, password, fcmToken);
    
    return successResponse(res, result, 'Login successful');
  } catch (error) {
    console.error('Login error:', error);
    const statusCode = error.message.includes('Invalid') ? 401 : 500;
    return errorResponse(res, error.message || 'Login failed', statusCode);
  }
};

const getProfileByUserId = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId, 10);
    const result = await authService.getProfileByUserId(userId, {
      id: req.user.id,
      role: req.user.role
    });

    return successResponse(res, result, 'Profile retrieved successfully');
  } catch (error) {
    console.error('Get profile by user id error:', error);
    const statusCode = error.message === 'User not found' ||
      error.message === 'Customer profile not found' ||
      error.message === 'Operator profile not found'
      ? 404
      : error.message.startsWith('Access denied')
        ? 403
        : error.message === 'Operator is not assigned to any project'
          ? 400
          : 500;
    return errorResponse(res, error.message || 'Failed to retrieve profile', statusCode);
  }
};

const logout = async (req, res) => {
  try {
    const fcmToken = req.body?.fcmToken ?? null;
    const result = await authService.logout(req.user.id, fcmToken);
    return successResponse(res, result, 'Logout successful');
  } catch (error) {
    console.error('Logout error:', error);
    const statusCode = error.message === 'User not found' ? 404 : 500;
    return errorResponse(res, error.message || 'Logout failed', statusCode);
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await authService.changePassword(req.user.id, currentPassword, newPassword);
    return successResponse(res, result, 'Password changed successfully');
  } catch (error) {
    console.error('Change password error:', error);
    const statusCode =
      error.message === 'User not found'
        ? 404
        : error.message === 'Current password is incorrect' ||
            error.message === 'New password must be different from current password'
          ? 400
          : 500;
    return errorResponse(res, error.message || 'Failed to change password', statusCode);
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email, role } = req.body;
    const result = await authService.forgotPassword(email, role || null);
    return successResponse(
      res,
      result,
      'If an account exists for this email, a password reset OTP has been sent'
    );
  } catch (error) {
    console.error('Forgot password error:', error);
    const statusCode =
      error.message.includes('Multiple accounts found') ||
      error.message.includes('Please wait')
        ? 400
        : error.message === 'Email service is not configured'
          ? 503
          : 500;
    return errorResponse(res, error.message || 'Failed to send password reset OTP', statusCode);
  }
};

const verifyForgotPasswordOtp = async (req, res) => {
  try {
    const { email, otp, newPassword, role } = req.body;
    const result = await authService.verifyForgotPasswordOtp({
      email,
      otp,
      newPassword,
      role: role || null
    });
    return successResponse(res, result, 'Password reset successful');
  } catch (error) {
    console.error('Verify forgot password OTP error:', error);
    const statusCode =
      error.message === 'Invalid email or OTP' ||
      error.message === 'Invalid or expired OTP'
        ? 400
        : error.message.includes('Multiple accounts found')
          ? 400
          : error.message === 'User not found'
            ? 404
            : 500;
    return errorResponse(res, error.message || 'Failed to verify OTP', statusCode);
  }
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
