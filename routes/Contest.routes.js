const express = require('express');
const router = express.Router();
const {
  createContest, updateContest, deleteContest,
  listContests, getContest,
  join, submitToContest,
  getLeaderboard, mySubmissions,
} = require('../controllers/contest.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);

// ── Public (authenticated) ────────────────────────────────────────────────────
router.get('/',          listContests);
router.get('/:id',       getContest);
router.post('/:id/join', join);
router.get('/:id/leaderboard',   getLeaderboard);
router.get('/:id/my-submissions', mySubmissions);

// Submit to a specific problem in a contest
// POST /api/contests/:id/submit/:problemOrder
router.post('/:id/submit/:problemOrder', submitToContest);

// ── Admin only ────────────────────────────────────────────────────────────────
router.post('/',     authorize('admin'), createContest);
router.put('/:id',   authorize('admin'), updateContest);
router.delete('/:id', authorize('admin'), deleteContest);

module.exports = router;