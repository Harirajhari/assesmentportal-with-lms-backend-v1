const User = require('../models/User');
const { generateTokenPair, verifyRefreshToken, generateAccessToken } = require('../services/auth.service');
const { sendSuccess } = require('../utils/response');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../config/logger');

/**
 * POST /api/auth/login
 * Authenticate admin or student
 */
const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // Select password explicitly (it's excluded by default)
  const user = await User.findOne({ email, isActive: true }).select('+password +refreshToken');

  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('Invalid email or password', 401));
  }

  const { accessToken, refreshToken } = generateTokenPair(user);

  // Persist refresh token
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  logger.info(`User logged in: ${user.email} [${user.role}]`);

  sendSuccess(res, {
    statusCode: 200,
    message: 'Login successful',
    data: {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        collegeId: user.collegeId,
        totalSolved: user.totalSolved,
        streak: user.streak,
        accuracy: user.accuracy,
      },
    },
  });
});

/**
 * POST /api/auth/refresh
 * Generate new access token from refresh token
 */
const refresh = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.body;

  const decoded = verifyRefreshToken(refreshToken);
  if (!decoded) {
    return next(new AppError('Invalid or expired refresh token', 401));
  }

  const user = await User.findById(decoded.id).select('+refreshToken');
  if (!user || user.refreshToken !== refreshToken) {
    return next(new AppError('Refresh token mismatch. Please log in again.', 401));
  }

  if (!user.isActive) {
    return next(new AppError('Account deactivated', 401));
  }

  const payload = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    collegeId: user.collegeId ? user.collegeId.toString() : null,
  };

  const accessToken = generateAccessToken(payload);

  sendSuccess(res, {
    message: 'Token refreshed',
    data: { accessToken },
  });
});

/**
 * POST /api/auth/logout
 * Invalidate refresh token
 */
const logout = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId).select('+refreshToken');
  if (user) {
    user.refreshToken = undefined;
    await user.save({ validateBeforeSave: false });
  }

  sendSuccess(res, { message: 'Logged out successfully' });
});

/**
 * GET /api/auth/me
 * Get current authenticated user profile
 */
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId)
    .populate('collegeId', 'name code')
    .lean();

  sendSuccess(res, { data: user });
});

module.exports = { login, refresh, logout, getMe };
