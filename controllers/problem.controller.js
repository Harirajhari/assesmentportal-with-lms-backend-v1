const mongoose = require('mongoose')
const Problem = require('../models/Problem');
const { sendSuccess, buildPaginationMeta } = require('../utils/response');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const Submission = require('../models/Submission');

/**
 * POST /api/problems  [admin]
 * Create a new problem
 */
const createProblem = asyncHandler(async (req, res, next) => {
  const existing = await Problem.findOne({ title: req.body.title });
  if (existing) return next(new AppError('A problem with this title already exists', 409));

  const problem = await Problem.create({
    ...req.body,
    createdBy: req.userId,
  });

  // Don't return hidden test cases
  const result = problem.toObject();
  delete result.testCases?.hidden;

  sendSuccess(res, {
    statusCode: 201,
    message: 'Problem created successfully',
    data: result,
  });
});

/**
 * GET /api/problems  [admin, student]
 * List problems with filters and pagination
 */
const getProblems = asyncHandler(async (req, res) => {
  const userId = req.userId

  const { page = 1, limit = 20, search, difficulty } = req.query
  const skip = (page - 1) * limit

  /* ── FILTER ── */
  const filter = { isActive: true }

  if (difficulty) filter.difficulty = difficulty

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { tags: { $in: [search.toLowerCase()] } },
    ]
  }

  /* ── FETCH PROBLEMS ── */
  const [problems, total] = await Promise.all([
    Problem.find(filter)
      .select('-testCases.hidden -testCases.sample.explanation')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),

    Problem.countDocuments(filter),
  ])

  /* ── FETCH USER SUBMISSIONS ── */
  let submissionMap = {}

  if (userId) {
    const submissions = await Submission.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
        },
      },
      {
        $group: {
          _id: '$problemId',

          // ✅ If ANY accepted → solved
          isSolved: {
            $max: {
              $cond: [{ $eq: ['$status', 'Accepted'] }, 1, 0],
            },
          },

          // ✅ Count attempts
          attempts: { $sum: 1 },
        },
      },
    ])

    /* ── CONVERT TO MAP ── */
    submissions.forEach((s) => {
      submissionMap[s._id.toString()] = {
        isSolved: s.isSolved === 1,
        isAttempted: s.attempts > 0,
        attempts: s.attempts,
      }
    })
  }

  /* ── MERGE DATA ── */
  const enrichedProblems = problems.map((p) => {
    const sub = submissionMap[p._id.toString()] || {}

    return {
      ...p,
      isSolved: sub.isSolved || false,
      isAttempted: sub.isAttempted || false,
      attempts: sub.attempts || 0,
    }
  })

  /* ── RESPONSE ── */
  sendSuccess(res, {
    data: enrichedProblems,
    meta: buildPaginationMeta(Number(page), Number(limit), total),
  })
})

module.exports = {
  getProblems,
}

/**
 * GET /api/problems/:id  [admin, student]
 * Get a single problem - always hides hidden test cases
 */
const getProblem = asyncHandler(async (req, res, next) => {
  const problem = await Problem.findOne({
    _id: req.params.id,
    isActive: true,
  })
    .select('-testCases.hidden')
    .lean();

  if (!problem) return next(new AppError('Problem not found', 404));

  sendSuccess(res, { data: problem });
});

/**
 * PUT /api/problems/:id  [admin]
 * Update a problem
 */
const updateProblem = asyncHandler(async (req, res, next) => {
  const problem = await Problem.findByIdAndUpdate(
    req.params.id,
    { ...req.body },
    { new: true, runValidators: true }
  ).select('-testCases.hidden');

  if (!problem) return next(new AppError('Problem not found', 404));

  sendSuccess(res, { message: 'Problem updated', data: problem });
});

/**
 * DELETE /api/problems/:id  [admin]
 * Soft-delete a problem
 */
const deleteProblem = asyncHandler(async (req, res, next) => {
  const problem = await Problem.findById(req.params.id);
  if (!problem) return next(new AppError('Problem not found', 404));

  problem.isActive = false;
  await problem.save();

  sendSuccess(res, { message: 'Problem deleted successfully' });
});

/**
 * GET /api/problems/:id/admin  [admin only]
 * Get problem WITH hidden test cases (admin use)
 */
const getProblemAdmin = asyncHandler(async (req, res, next) => {
  const problem = await Problem.findById(req.params.id).select('+testCases.hidden').lean();
  if (!problem) return next(new AppError('Problem not found', 404));

  sendSuccess(res, { data: problem });
});

module.exports = {
  createProblem,
  getProblems,
  getProblem,
  updateProblem,
  deleteProblem,
  getProblemAdmin,
};
