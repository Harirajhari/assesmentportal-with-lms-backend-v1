const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later',
  },
  skip: (req) => req.path === '/health',
});

// Strict limiter for code submission (prevent abuse)
const submissionLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_SUBMISSIONS) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || req.ip,
  message: {
    success: false,
    message: 'Submission rate limit exceeded. You can submit at most 5 times per minute.',
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Submission rate limit exceeded. Please wait before submitting again.',
      retryAfter: Math.ceil(submissionLimiter.windowMs / 1000),
    });
  },
});

// Auth limiter to prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
});

module.exports = { apiLimiter, submissionLimiter, authLimiter };
