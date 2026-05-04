const Joi = require('joi');

// ─── Auth ────────────────────────────────────────────────────────────────────
const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().min(6).required(),
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

// ─── College ─────────────────────────────────────────────────────────────────
const createCollegeSchema = Joi.object({
  name: Joi.string().min(2).max(150).trim().required(),
  code: Joi.string().alphanum().max(8).uppercase().optional(),
});

// ─── Student ─────────────────────────────────────────────────────────────────
const createStudentSchema = Joi.object({
  name: Joi.string().min(2).max(100).trim().required(),
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().min(6).required(),
  collegeId: Joi.string().hex().length(24).required(),
});

const updateStudentSchema = Joi.object({
  name: Joi.string().min(2).max(100).trim().optional(),
  email: Joi.string().email().lowercase().trim().optional(),
  isActive: Joi.boolean().optional(),
});

// ─── Problem ─────────────────────────────────────────────────────────────────
const testCaseSchema = Joi.object({
  input: Joi.string().required(),
  expectedOutput: Joi.string().required(),
  explanation: Joi.string().optional().allow(''),
});

const exampleSchema = Joi.object({
  input: Joi.string().required(),
  output: Joi.string().required(),
  explanation: Joi.string().optional().allow(''),
});

const createProblemSchema = Joi.object({
  title: Joi.string().min(3).max(200).trim().required(),
  difficulty: Joi.string().valid('Easy', 'Medium', 'Hard').required(),
  tags: Joi.array().items(Joi.string().trim().lowercase()).min(1).required(),
  description: Joi.string().min(10).required(),
  constraints: Joi.string().min(5).required(),
  examples: Joi.array().items(exampleSchema).min(1).required(),
  testCases: Joi.object({
    sample: Joi.array().items(testCaseSchema).min(1).required(),
    hidden: Joi.array().items(testCaseSchema).min(1).required(),
  }).required(),
  starterCode: Joi.object({
    javascript: Joi.string().optional().allow(''),
    python: Joi.string().optional().allow(''),
    java: Joi.string().optional().allow(''),
    cpp: Joi.string().optional().allow(''),
    c: Joi.string().optional().allow(''),
  }).optional(),
  timeLimit: Joi.number().integer().min(500).max(10000).optional(),
  memoryLimit: Joi.number().integer().min(16).max(512).optional(),
});

const updateProblemSchema = createProblemSchema.fork(
  ['title', 'difficulty', 'tags', 'description', 'constraints', 'examples', 'testCases'],
  field => field.optional()
);

// ─── Execution ───────────────────────────────────────────────────────────────
const executeSchema = Joi.object({
  problemId: Joi.string().hex().length(24).required(),
  code: Joi.string().min(1).max(65536).required(),
  language: Joi.string()
    .valid('javascript', 'python', 'java', 'cpp', 'c', 'typescript', 'go', 'rust', 'ruby', 'csharp')
    .required(),
});

const submitSchema = Joi.object({
  problemId: Joi.string().hex().length(24).required(),
  code: Joi.string().min(1).max(65536).required(),
  language: Joi.string()
    .valid('javascript', 'python', 'java', 'cpp', 'c', 'typescript', 'go', 'rust', 'ruby', 'csharp')
    .required(),
});

// ─── Pagination ──────────────────────────────────────────────────────────────
const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().optional().allow(''),
  difficulty: Joi.string().valid('Easy', 'Medium', 'Hard').optional(),
  status: Joi.string().optional(),
  collegeId: Joi.string().hex().length(24).optional(),
});

module.exports = {
  loginSchema,
  refreshTokenSchema,
  createCollegeSchema,
  createStudentSchema,
  updateStudentSchema,
  createProblemSchema,
  updateProblemSchema,
  executeSchema,
  submitSchema,
  paginationSchema,
};
