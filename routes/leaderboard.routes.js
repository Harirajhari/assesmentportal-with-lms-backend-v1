const express = require('express');
const router = express.Router();

const {
  getLeaderboard,
  getCollegeLeaderboardById,
  rebuildLeaderboard,
  getOverallLeaderboardHandler,
  rebuildOverallLeaderboard,
} = require('../controllers/leaderboard.controller');

const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);

// GET /api/leaderboard
// - student: sees their own college leaderboard (+ myRank + myOverallRank)
// - admin: sees all college leaderboards summary
router.get('/', getLeaderboard);

// GET /api/leaderboard/overall  [student + admin]
// Overall leaderboard across all colleges with college name shown per entry
router.get('/overall', getOverallLeaderboardHandler);

// POST /api/leaderboard/overall/rebuild  [admin only]
router.post('/overall/rebuild', authorize('admin'), rebuildOverallLeaderboard);

// GET /api/leaderboard/:collegeId  [admin only]
router.get('/:collegeId', authorize('admin'), getCollegeLeaderboardById);

// POST /api/leaderboard/:collegeId/rebuild  [admin only]
router.post('/:collegeId/rebuild', authorize('admin'), rebuildLeaderboard);

module.exports = router;