const express = require('express');
const router = express.Router();

const {
  getSubmissions,
  getSubmission,
  getSubmissionStats,
} = require('../controllers/submission.controller');

const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);

// GET /api/submissions  [all: admin sees all, student sees own]
router.get('/', getSubmissions);

// GET /api/submissions/stats  [admin only]
router.get('/stats', authorize('admin'), getSubmissionStats);

// GET /api/submissions/:id  [admin or owner]
router.get('/:id', getSubmission);

module.exports = router;
