const College = require('../models/College');
const User = require('../models/User');
const { sendSuccess, buildPaginationMeta } = require('../utils/response');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * POST /api/colleges  [admin]
 * Create a new college
 */
const createCollege = asyncHandler(async (req, res, next) => {
  const { name, code } = req.body;

  const existing = await College.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
  if (existing) {
    return next(new AppError(`College '${name}' already exists`, 409));
  }

  const college = await College.create({ name, code });

  sendSuccess(res, {
    statusCode: 201,
    message: 'College created successfully',
    data: college,
  });
});

/**
 * GET /api/colleges  [admin, student]
 * List all colleges with optional search and pagination
 */
const getColleges = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const skip = (page - 1) * limit;

  const filter = { isActive: true };
  if (search) {
    filter.$text = { $search: search };
  }

  const [colleges, total] = await Promise.all([
    College.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    College.countDocuments(filter),
  ]);

  sendSuccess(res, {
    data: colleges,
    meta: buildPaginationMeta(Number(page), Number(limit), total),
  });
});

/**
 * GET /api/colleges/:id  [admin, student]
 * Get a single college by ID
 */
const getCollege = asyncHandler(async (req, res, next) => {
  const college = await College.findById(req.params.id).lean();
  if (!college) return next(new AppError('College not found', 404));

  sendSuccess(res, { data: college });
});

/**
 * GET /api/colleges/:id/students  [admin]
 * Get all students belonging to a college
 */
const getCollegeStudents = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { page = 1, limit = 20, search } = req.query;
  const skip = (page - 1) * limit;

  const college = await College.findById(id).lean();
  if (!college) return next(new AppError('College not found', 404));

  const filter = { collegeId: id, role: 'student', isActive: true };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const [students, total] = await Promise.all([
    User.find(filter)
      .select('name email totalSolved streak accuracy createdAt')
      .sort({ totalSolved: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    User.countDocuments(filter),
  ]);

  sendSuccess(res, {
    data: { college, students },
    meta: buildPaginationMeta(Number(page), Number(limit), total),
  });
});

/**
 * PUT /api/colleges/:id  [admin]
 * Update college details
 */
const updateCollege = asyncHandler(async (req, res, next) => {
  const college = await College.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!college) return next(new AppError('College not found', 404));

  sendSuccess(res, { message: 'College updated', data: college });
});

/**
 * DELETE /api/colleges/:id  [admin]
 * Soft-delete a college
 */
const deleteCollege = asyncHandler(async (req, res, next) => {
  const college = await College.findById(req.params.id);
  if (!college) return next(new AppError('College not found', 404));

  college.isActive = false;
  await college.save();

  sendSuccess(res, { message: 'College deactivated successfully' });
});

module.exports = {
  createCollege,
  getColleges,
  getCollege,
  getCollegeStudents,
  updateCollege,
  deleteCollege,
};
