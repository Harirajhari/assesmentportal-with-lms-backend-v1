const express = require('express');
const router = express.Router();

const { execute, submit } = require('../controllers/execution.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { submissionLimiter } = require('../middlewares/rateLimiter');
const { validate } = require('../middlewares/validate');
const { executeSchema, submitSchema } = require('../utils/validators');

router.use(authenticate);

// POST /api/execute  [all authenticated - runs sample test cases]
router.post('/execute', submissionLimiter, validate(executeSchema), execute);

// POST /api/submit  [all authenticated - runs hidden test cases, records submission]
router.post('/submit', submissionLimiter, validate(submitSchema), submit);

// Export a combined router that handles both /execute and /submit under /api
module.exports = router;
