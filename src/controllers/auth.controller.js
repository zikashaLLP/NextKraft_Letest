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

module.exports = {
  signUp,
  login,
  logout,
  getProfileByUserId
};
