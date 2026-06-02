const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const {
    getToday, submitDaily, getStreak,
    getCalendar, schedule, unschedule, adminStats,
} = require('../controllers/dailyChallenge.controller');

// ── Student routes (protected) ────────────────────────────────────────────────
router.get('/', authenticate, getToday);       // today's challenge
router.post('/submit', authenticate, submitDaily);     // submit solution
router.get('/streak', authenticate, getStreak);       // streak + 30-day history
router.get('/calendar', authenticate, getCalendar);     // monthly calendar view

// ── Admin routes ──────────────────────────────────────────────────────────────
router.post('/schedule', authenticate, authorize('admin'), schedule);      // bulk schedule
router.delete('/:date', authenticate, authorize('admin'), unschedule);    // remove a day
router.get('/admin/stats', authenticate, authorize('admin'), adminStats);    // dashboard stats

module.exports = router;

// ── Register in app.js / server.js ────────────────────────────────────────────
// app.use('/api/daily', require('./routes/daily.routes'));