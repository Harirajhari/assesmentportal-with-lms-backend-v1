const express = require('express');
const router = express.Router();

const {
  createStudent,
  getStudents,
  getStudent,
  updateStudent,
  deleteStudent,
} = require('../controllers/student.controller');

const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate');
const { createStudentSchema, updateStudentSchema } = require('../utils/validators');

router.use(authenticate);

// POST /api/students  [admin only]
router.post('/', authorize('admin'), validate(createStudentSchema), createStudent);

// GET /api/students  [admin only]
router.get('/', authorize('admin'), getStudents);

// GET /api/students/:id  [admin or self]
router.get('/:id', getStudent);

// PUT /api/students/:id  [admin only]
router.put('/:id', authorize('admin'), validate(updateStudentSchema), updateStudent);

// DELETE /api/students/:id  [admin only]
router.delete('/:id', authorize('admin'), deleteStudent);

module.exports = router;
