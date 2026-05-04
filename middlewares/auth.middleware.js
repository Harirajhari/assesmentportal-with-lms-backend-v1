const { verifyAccessToken } = require('../services/auth.service');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const logger = require('../config/logger');

/**
 * Verify JWT access token and attach user to request
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Access token required', 401));
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    if (!decoded) {
      return next(new AppError('Invalid or expired access token', 401));
    }

    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user) {
      return next(new AppError('User no longer exists', 401));
    }

    if (!user.isActive) {
      return next(new AppError('Account has been deactivated', 401));
    }

    req.user = user;
    req.userId = user._id.toString();
    req.userRole = user.role;

    next();
  } catch (error) {
    logger.error('Auth middleware error:', error.message);
    next(new AppError('Authentication failed', 401));
  }
};

/**
 * Role-based access control middleware factory
 * Usage: authorize('admin') or authorize('admin', 'student')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}`,
          403
        )
      );
    }

    next();
  };
};

/**
 * Middleware to verify student can only access their own college data
 */
const collegeScope = (req, res, next) => {
  if (req.user.role === 'admin') return next();

  const requestedCollegeId = req.params.collegeId || req.query.collegeId;

  if (requestedCollegeId && requestedCollegeId !== req.user.collegeId?.toString()) {
    return next(new AppError('Access denied: you can only access your own college data', 403));
  }

  next();
};

module.exports = { authenticate, authorize, collegeScope };
