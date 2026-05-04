const Problem = require('../models/Problem');
const Submission = require('../models/Submission');
const User = require('../models/User');
const { runMultipleTestCases } = require('../services/judge0.service');
const { syncUserLeaderboard } = require('../services/leaderboard.service');
const { sendSuccess } = require('../utils/response');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../config/logger');

/**
 * POST /api/execute
 * Run code against SAMPLE test cases only (no submission recorded for students)
 */
const execute = asyncHandler(async (req, res, next) => {
  const { problemId, code, language } = req.body;

  const problem = await Problem.findOne({ _id: problemId, isActive: true }).lean();
  if (!problem) return next(new AppError('Problem not found', 404));

  const sampleTestCases = problem.testCases?.sample;
  if (!sampleTestCases?.length) {
    return next(new AppError('No sample test cases available for this problem', 400));
  }

  logger.info(`Execute request: user=${req.userId} problem=${problemId} lang=${language}`);

  const executionResult = await runMultipleTestCases({
    code,
    language,
    testCases: sampleTestCases,
    timeLimit: problem.timeLimit,
    memoryLimit: problem.memoryLimit,
  });

  sendSuccess(res, {
    message: 'Execution complete',
    data: {
      language,
      overallStatus: executionResult.overallStatus,
      allPassed: executionResult.allPassed,
      passedCount: executionResult.passedCount,
      totalTestCases: executionResult.totalTestCases,
      avgRuntime: executionResult.avgRuntime,
      maxMemory: executionResult.maxMemory,
      results: executionResult.results.map(r => ({
        passed: r.passed,
        input: r.input,
        expectedOutput: r.expectedOutput,
        actualOutput: r.actualOutput,
        stdout: r.stdout,
        stderr: r.stderr,
        compileOutput: r.compileOutput,
        statusDescription: r.statusDescription,
        runtime: r.runtime,
        memory: r.memory,
      })),
    },
  });
});

/**
 * POST /api/submit
 * Run code against HIDDEN test cases and record the submission
 */
const submit = asyncHandler(async (req, res, next) => {
  const { problemId, code, language } = req.body;
  const user = req.user;

  // Fetch problem WITH hidden test cases
  const problem = await Problem.findOne({ _id: problemId, isActive: true })
    .select('+testCases.hidden')
    .lean();

  if (!problem) return next(new AppError('Problem not found', 404));

  const hiddenTestCases = problem.testCases?.hidden;
  if (!hiddenTestCases?.length) {
    return next(new AppError('No hidden test cases configured for this problem', 500));
  }

  logger.info(`Submit request: user=${req.userId} problem=${problemId} lang=${language}`);

  // Create submission record as Pending
  const submission = await Submission.create({
    userId: user._id,
    collegeId: user.collegeId,
    problemId,
    code,
    language,
    status: 'Pending',
    totalTestCases: hiddenTestCases.length,
  });

  // Run against all hidden test cases
  let executionResult;
  try {
    executionResult = await runMultipleTestCases({
      code,
      language,
      testCases: hiddenTestCases,
      timeLimit: problem.timeLimit,
      memoryLimit: problem.memoryLimit,
    });
  } catch (err) {
    submission.status = 'Internal Error';
    await submission.save();
    return next(new AppError(`Execution failed: ${err.message}`, 500));
  }

  const isAccepted = executionResult.allPassed;
  const firstResult = executionResult.results[0] || {};

  // Update submission record
  submission.status = executionResult.overallStatus;
  submission.runtime = executionResult.avgRuntime;
  submission.memory = executionResult.maxMemory;
  submission.testCasesPassed = executionResult.passedCount;
  submission.stdout = firstResult.stdout || '';
  submission.stderr = firstResult.stderr || '';
  submission.compileOutput = firstResult.compileOutput || '';
  await submission.save();

  // Update problem stats
  await Problem.findByIdAndUpdate(problemId, {
    $inc: {
      totalSubmissions: 1,
      ...(isAccepted ? { totalAccepted: 1 } : {}),
    },
  });

  // Update user stats if accepted
  if (isAccepted) {
    const freshUser = await User.findById(user._id);
    const isFirstSolve = !freshUser.solvedProblems.some(
      id => id.toString() === problemId
    );

    if (isFirstSolve) {
      freshUser.totalSolved += 1;
      freshUser.solvedProblems.push(problemId);
      submission.isFirstAccepted = true;
      await submission.save();
    }

    freshUser.updateStreak();
    freshUser.updateAccuracy(true);
    await freshUser.save({ validateBeforeSave: false });

    // Sync Redis leaderboard score
    await syncUserLeaderboard(freshUser);
  } else {
    // Still update accuracy for failed submissions
    const freshUser = await User.findById(user._id);
    freshUser.updateAccuracy(false);
    await freshUser.save({ validateBeforeSave: false });
  }

  sendSuccess(res, {
    statusCode: 201,
    message: isAccepted ? '🎉 Accepted! All test cases passed.' : `Submission status: ${executionResult.overallStatus}`,
    data: {
      submissionId: submission._id,
      status: submission.status,
      language,
      passedCount: executionResult.passedCount,
      totalTestCases: executionResult.totalTestCases,
      runtime: submission.runtime,
      memory: submission.memory,
      isFirstAccepted: submission.isFirstAccepted,
      compileOutput: submission.compileOutput || undefined,
      // Only show detailed results if not accepted (for debugging)
      ...(isAccepted
        ? {}
        : {
            firstFailure: executionResult.results.find(r => !r.passed)
              ? {
                  input: executionResult.results.find(r => !r.passed).input,
                  expectedOutput: executionResult.results.find(r => !r.passed).expectedOutput,
                  actualOutput: executionResult.results.find(r => !r.passed).actualOutput,
                  stderr: executionResult.results.find(r => !r.passed).stderr,
                  statusDescription: executionResult.results.find(r => !r.passed).statusDescription,
                }
              : null,
          }),
    },
  });
});

module.exports = { execute, submit };
