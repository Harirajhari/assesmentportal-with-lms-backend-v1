const Submission = require('../models/Submission');
const { sendSuccess, buildPaginationMeta } = require('../utils/response');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * GET /api/submissions  [admin: all, student: own]
 * List submissions with filters
 */
const getSubmissions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, problemId, userId, collegeId } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};

  if (req.user.role === 'student') {
    // Students can only see their own submissions
    filter.userId = req.userId;
  } else {
    // Admin can filter by userId, collegeId
    if (userId) filter.userId = userId;
    if (collegeId) filter.collegeId = collegeId;
  }

  if (status) filter.status = status;
  if (problemId) filter.problemId = problemId;

  const [submissions, total] = await Promise.all([
    Submission.find(filter)
      .populate('userId', 'name email')
      .populate('problemId', 'title difficulty slug')
      .populate('collegeId', 'name code')
      .select('-code') // Don't return code in list view
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Submission.countDocuments(filter),
  ]);

  sendSuccess(res, {
    data: submissions,
    meta: buildPaginationMeta(Number(page), Number(limit), total),
  });
});

/**
 * GET /api/submissions/:id  [admin or owner]
 * Get a single submission with full code
 */
const getSubmission = asyncHandler(async (req, res, next) => {
  const submission = await Submission.findById(req.params.id)
    .populate('userId', 'name email collegeId')
    .populate('problemId', 'title difficulty slug')
    .populate('collegeId', 'name code')
    .lean();

  if (!submission) return next(new AppError('Submission not found', 404));

  // Students can only view their own submissions
  if (
    req.user.role === 'student' &&
    submission.userId._id.toString() !== req.userId
  ) {
    return next(new AppError('Access denied', 403));
  }

  sendSuccess(res, { data: submission });
});

/**
 * GET /api/submissions/stats  [admin]
 * Submission statistics overview
 */
const getSubmissionStats = asyncHandler(async (req, res) => {
  const { collegeId } = req.query;

  const matchStage = collegeId ? { $match: { collegeId: require('mongoose').Types.ObjectId(collegeId) } } : { $match: {} };

  const stats = await Submission.aggregate([
    matchStage,
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);

  const total = stats.reduce((acc, s) => acc + s.count, 0);
  const accepted = stats.find(s => s._id === 'Accepted')?.count || 0;

  sendSuccess(res, {
    data: {
      total,
      accepted,
      acceptanceRate: total > 0 ? parseFloat(((accepted / total) * 100).toFixed(2)) : 0,
      breakdown: stats.map(s => ({ status: s._id, count: s.count })),
    },
  });
});

module.exports = { getSubmissions, getSubmission, getSubmissionStats };
