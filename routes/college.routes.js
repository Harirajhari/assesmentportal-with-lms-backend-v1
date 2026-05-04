const express = require('express');
const router = express.Router();

const {
  createCollege,
  getColleges,
  getCollege,
  getCollegeStudents,
  updateCollege,
  deleteCollege,
} = require('../controllers/college.controller');

const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate');
const { createCollegeSchema } = require('../utils/validators');

// All routes require authentication
router.use(authenticate);

// GET /api/colleges  [admin, student]
router.get('/', getColleges);

// POST /api/colleges  [admin only]
router.post('/', authorize('admin'), validate(createCollegeSchema), createCollege);

// GET /api/colleges/:id  [admin, student]
router.get('/:id', getCollege);

// PUT /api/colleges/:id  [admin only]
router.put('/:id', authorize('admin'), updateCollege);

// DELETE /api/colleges/:id  [admin only]
router.delete('/:id', authorize('admin'), deleteCollege);

// GET /api/colleges/:id/students  [admin only]
router.get('/:id/students', authorize('admin'), getCollegeStudents);

module.exports = router;
