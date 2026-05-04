const express = require('express');
const router = express.Router();

const {
  createProblem,
  getProblems,
  getProblem,
  updateProblem,
  deleteProblem,
  getProblemAdmin,
} = require('../controllers/problem.controller');

const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate');
const { createProblemSchema, updateProblemSchema } = require('../utils/validators');

router.use(authenticate);

// GET /api/problems  [all]
router.get('/', getProblems);

// POST /api/problems  [admin only]
router.post('/', authorize('admin'), validate(createProblemSchema), createProblem);

// GET /api/problems/:id  [all - hides hidden test cases]
router.get('/:id', getProblem);

// GET /api/problems/:id/admin  [admin only - shows everything]
router.get('/:id/admin', authorize('admin'), getProblemAdmin);

// PUT /api/problems/:id  [admin only]
router.put('/:id', authorize('admin'), validate(updateProblemSchema), updateProblem);

// DELETE /api/problems/:id  [admin only]
router.delete('/:id', authorize('admin'), deleteProblem);

module.exports = router;
