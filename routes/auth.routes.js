const express = require('express');
const router = express.Router();

const { login, refresh, logout, getMe } = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authLimiter } = require('../middlewares/rateLimiter');
const { validate } = require('../middlewares/validate');
const { loginSchema, refreshTokenSchema } = require('../utils/validators');

// POST /api/auth/login
router.post('/login', authLimiter, validate(loginSchema), login);

// POST /api/auth/refresh
router.post('/refresh', validate(refreshTokenSchema), refresh);

// POST /api/auth/logout  [protected]
router.post('/logout', authenticate, logout);

// GET /api/auth/me  [protected]
router.get('/me', authenticate, getMe);

module.exports = router;
