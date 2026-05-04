const {
  getCollegeLeaderboard,
  getAllLeaderboards,
  getUserRank,
  buildCollegeLeaderboard,
  getOverallLeaderboard,
  buildOverallLeaderboard,
  getUserOverallRank,
} = require('../services/leaderboard.service');
const College = require('../models/College');
const { sendSuccess } = require('../utils/response');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * GET /api/leaderboard  [student: own college, admin: all colleges]
 * Students see their college leaderboard
 * Admins see a summary of all colleges
 */
const getLeaderboard = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 50 } = req.query;

  if (req.user.role === 'admin') {
    const data = await getAllLeaderboards({ page: Number(page), limit: Number(limit) });
    return sendSuccess(res, {
      message: 'All college leaderboards',
      data,
    });
  }

  // Student: own college leaderboard
  const collegeId = req.user.collegeId;
  if (!collegeId) return next(new AppError('No college associated with your account', 400));

  const leaderboard = await getCollegeLeaderboard(collegeId, {
    page: Number(page),
    limit: Number(limit),
  });

  // Include user's college rank and overall rank
  const [userRank, userOverallRank] = await Promise.all([
    getUserRank(req.userId, collegeId),
    getUserOverallRank(req.userId),
  ]);

  sendSuccess(res, {
    data: {
      ...leaderboard,
      myRank: userRank,
      myOverallRank: userOverallRank,
    },
  });
});

/**
 * GET /api/leaderboard/overall  [student + admin]
 * Get the overall leaderboard across all colleges
 */
const getOverallLeaderboardHandler = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 50 } = req.query;

  const leaderboard = await getOverallLeaderboard({
    page: Number(page),
    limit: Number(limit),
  });

  // For students also return their own rank
  let myOverallRank = null;
  if (req.user.role === 'student') {
    myOverallRank = await getUserOverallRank(req.userId);
  }

  sendSuccess(res, {
    data: {
      ...leaderboard,
      ...(myOverallRank !== null && { myOverallRank }),
    },
  });
});

/**
 * POST /api/leaderboard/overall/rebuild  [admin]
 * Force-rebuild the overall Redis leaderboard
 */
const rebuildOverallLeaderboard = asyncHandler(async (req, res) => {
  await buildOverallLeaderboard();
  sendSuccess(res, { message: 'Overall leaderboard rebuilt successfully' });
});

/**
 * GET /api/leaderboard/:collegeId  [admin]
 * Get leaderboard for a specific college
 */
const getCollegeLeaderboardById = asyncHandler(async (req, res, next) => {
  const { collegeId } = req.params;
  const { page = 1, limit = 50 } = req.query;

  const college = await College.findById(collegeId).lean();
  if (!college) return next(new AppError('College not found', 404));

  const leaderboard = await getCollegeLeaderboard(collegeId, {
    page: Number(page),
    limit: Number(limit),
  });

  sendSuccess(res, {
    data: {
      college: { id: college._id, name: college.name, code: college.code },
      ...leaderboard,
    },
  });
});

/**
 * POST /api/leaderboard/:collegeId/rebuild  [admin]
 * Force-rebuild Redis leaderboard for a college from MongoDB
 */
const rebuildLeaderboard = asyncHandler(async (req, res, next) => {
  const { collegeId } = req.params;

  const college = await College.findById(collegeId);
  if (!college) return next(new AppError('College not found', 404));

  await buildCollegeLeaderboard(collegeId);

  sendSuccess(res, { message: `Leaderboard rebuilt for ${college.name}` });
});

module.exports = {
  getLeaderboard,
  getCollegeLeaderboardById,
  rebuildLeaderboard,
  getOverallLeaderboardHandler,
  rebuildOverallLeaderboard,
};