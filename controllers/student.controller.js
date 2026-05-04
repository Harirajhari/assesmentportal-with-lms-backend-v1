const User = require('../models/User');
const College = require('../models/College');
const { sendSuccess, buildPaginationMeta } = require('../utils/response');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { removeUserFromLeaderboard } = require('../services/leaderboard.service');

/**
 * POST /api/students  [admin]
 * Create a new student account
 */
const createStudent = asyncHandler(async (req, res, next) => {
  const { name, email, password, collegeId } = req.body;

  // Verify college exists
  const college = await College.findById(collegeId);
  if (!college || !college.isActive) {
    return next(new AppError('College not found or inactive', 404));
  }

  // Check email uniqueness
  const exists = await User.findOne({ email });
  if (exists) return next(new AppError('Email already registered', 409));

  const student = await User.create({
    name,
    email,
    password,
    role: 'student',
    collegeId,
  });

  // Increment college student count
  await College.findByIdAndUpdate(collegeId, { $inc: { studentCount: 1 } });

  sendSuccess(res, {
    statusCode: 201,
    message: 'Student created successfully',
    data: {
      id: student._id,
      name: student.name,
      email: student.email,
      role: student.role,
      collegeId: student.collegeId,
      createdAt: student.createdAt,
    },
  });
});

/**
 * GET /api/students  [admin]
 * List all students with filters
 */
const getStudents = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, collegeId } = req.query;
  const skip = (page - 1) * limit;

  const filter = { role: 'student', isActive: true };
  if (collegeId) filter.collegeId = collegeId;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const [students, total] = await Promise.all([
    User.find(filter)
      .populate('collegeId', 'name code')
      .select('name email totalSolved streak accuracy collegeId createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    User.countDocuments(filter),
  ]);

  sendSuccess(res, {
    data: students,
    meta: buildPaginationMeta(Number(page), Number(limit), total),
  });
});

/**
 * GET /api/students/:id  [admin, or self]
 * Get a student's profile
 */
const getStudent = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Students can only view their own profile
  if (req.user.role === 'student' && req.userId !== id) {
    return next(new AppError('Access denied', 403));
  }

  const student = await User.findById(id)
    .populate('collegeId', 'name code')
    .select('-refreshToken')
    .lean();

  if (!student || student.role !== 'student') {
    return next(new AppError('Student not found', 404));
  }

  sendSuccess(res, { data: student });
});

/**
 * PUT /api/students/:id  [admin]
 * Update student details
 */
const updateStudent = asyncHandler(async (req, res, next) => {
  const { name, email, isActive } = req.body;
  const student = await User.findById(req.params.id);

  if (!student || student.role !== 'student') {
    return next(new AppError('Student not found', 404));
  }

  if (email && email !== student.email) {
    const emailExists = await User.findOne({ email });
    if (emailExists) return next(new AppError('Email already in use', 409));
    student.email = email;
  }

  if (name) student.name = name;
  if (isActive !== undefined) student.isActive = isActive;

  await student.save({ validateBeforeSave: false });

  sendSuccess(res, { message: 'Student updated', data: student });
});

/**
 * DELETE /api/students/:id  [admin]
 * Deactivate a student account
 */
const deleteStudent = asyncHandler(async (req, res, next) => {
  const student = await User.findById(req.params.id);
  if (!student || student.role !== 'student') {
    return next(new AppError('Student not found', 404));
  }

  student.isActive = false;
  await student.save({ validateBeforeSave: false });

  // Remove from Redis leaderboard
  if (student.collegeId) {
    await removeUserFromLeaderboard(student._id, student.collegeId);
  }

  // Decrement college student count
  await College.findByIdAndUpdate(student.collegeId, { $inc: { studentCount: -1 } });

  sendSuccess(res, { message: 'Student deactivated successfully' });
});

module.exports = {
  createStudent,
  getStudents,
  getStudent,
  updateStudent,
  deleteStudent,
};
