const Contest = require('../models/Contest');
const ContestParticipant = require('../models/ContestParticipant');
const ContestSubmission = require('../models/ContestSubmission');
const Problem = require('../models/Problem');
const { sendSuccess } = require('../utils/response');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const {
  joinContest,
  recordResult,
  getContestLeaderboard,
  emitLeaderboard,
} = require('../services/contest.service');
const { runSubmission } = require('../services/judge0.service');

// ─── Admin: Create contest ────────────────────────────────────────────────────
const createContest = asyncHandler(async (req, res, next) => {
  const {
    title, description, startTime, endTime,
    problems, scope, allowedColleges,
    freezeMinutes, sequentialUnlock,
  } = req.body;

  if (new Date(endTime) <= new Date(startTime)) {
    return next(new AppError('End time must be after start time', 400));
  }

  // Validate problem IDs exist
  const problemIds = problems.map(p => p.problemId);
  const found = await Problem.find({ _id: { $in: problemIds }, isActive: true }).select('_id');
  if (found.length !== problemIds.length) {
    return next(new AppError('One or more problem IDs are invalid', 400));
  }

  const contest = await Contest.create({
    title, description,
    startTime: new Date(startTime),
    endTime:   new Date(endTime),
    problems, scope: scope || 'all',
    allowedColleges: allowedColleges || [],
    freezeMinutes:   freezeMinutes   || 0,
    sequentialUnlock: !!sequentialUnlock,
    status: new Date(startTime) > new Date() ? 'upcoming' : 'live',
    createdBy: req.userId,
  });

  sendSuccess(res, { message: 'Contest created', data: contest }, 201);
});

// ─── Admin: Update contest ────────────────────────────────────────────────────
const updateContest = asyncHandler(async (req, res, next) => {
  const contest = await Contest.findById(req.params.id);
  if (!contest) return next(new AppError('Contest not found', 404));

  const allowed = ['title', 'description', 'startTime', 'endTime',
                   'problems', 'scope', 'allowedColleges',
                   'freezeMinutes', 'sequentialUnlock', 'status'];

  allowed.forEach(field => {
    if (req.body[field] !== undefined) contest[field] = req.body[field];
  });

  await contest.save();
  sendSuccess(res, { message: 'Contest updated', data: contest });
});

// ─── Admin: Delete contest ────────────────────────────────────────────────────
const deleteContest = asyncHandler(async (req, res, next) => {
  const contest = await Contest.findByIdAndDelete(req.params.id);
  if (!contest) return next(new AppError('Contest not found', 404));
  sendSuccess(res, { message: 'Contest deleted' });
});

// ─── List contests (student: only visible ones) ───────────────────────────────
const listContests = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const filter = { isActive: true };
  if (status) filter.status = status;

  // Students: only see contests they are allowed to join
  if (req.user.role === 'student') {
    filter.status = { $in: ['upcoming', 'live', 'frozen', 'ended'] };
    filter.$or = [
      { scope: 'all' },
      { scope: 'college', allowedColleges: req.user.collegeId },
    ];
  }

  const [contests, total] = await Promise.all([
    Contest.find(filter)
      .select('-problems.problemId') // don't leak problem ids to students before start
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Contest.countDocuments(filter),
  ]);

  // Compute live status for each
  const now = new Date();
  const enriched = contests.map(c => ({
    ...c,
    problemCount: c.problems?.length ?? 0,
    durationMinutes: Math.round((new Date(c.endTime) - new Date(c.startTime)) / 60000),
  }));

  sendSuccess(res, { data: enriched, total, page: Number(page), limit: Number(limit) });
});

// ─── Get one contest (student: problems visible only if live/ended) ────────────
const getContest = asyncHandler(async (req, res, next) => {
  const contest = await Contest.findById(req.params.id)
    .populate('problems.problemId', 'title difficulty description constraints examples starterCode tags timeLimit memoryLimit')
    .lean();

  if (!contest) return next(new AppError('Contest not found', 404));

  const now = new Date();
  const isStudent = req.user.role === 'student';
  const hasStarted = now >= new Date(contest.startTime);
  const hasEnded   = now >= new Date(contest.endTime);

  // Students can't see problem details before contest starts
  if (isStudent && !hasStarted) {
    const safeContest = { ...contest };
    safeContest.problems = contest.problems.map(p => ({
      order: p.order, points: p.points,
      problemId: { title: '— Hidden until start —' },
    }));
    return sendSuccess(res, { data: safeContest });
  }

  // For sequential unlock: mark which problems are unlocked for this student
  let unlockedOrders = contest.problems.map(p => p.order); // default: all unlocked

  if (isStudent && contest.sequentialUnlock && hasStarted) {
    const participant = await ContestParticipant.findOne({
      contestId: contest._id, userId: req.userId,
    });
    const solved = participant?.solvedOrders ?? [];
    // Unlock up to the first unsolved problem
    unlockedOrders = [];
    for (const prob of contest.problems.sort((a, b) => a.order - b.order)) {
      unlockedOrders.push(prob.order);
      if (!solved.includes(prob.order)) break; // stop here — next is locked
    }
  }

  // Attach participant's own stats if student
  let myStats = null;
  if (isStudent) {
    const p = await ContestParticipant.findOne({ contestId: contest._id, userId: req.userId });
    myStats = p ? {
      totalPoints:    p.totalPoints,
      penaltyMinutes: p.penaltyMinutes,
      solvedOrders:   p.solvedOrders,
      problemStats:   Object.fromEntries(p.problemStats),
    } : null;
  }

  sendSuccess(res, {
    data: {
      ...contest,
      unlockedOrders,
      myStats,
      hasStarted,
      hasEnded,
      durationMinutes: Math.round((new Date(contest.endTime) - new Date(contest.startTime)) / 60000),
    },
  });
});

// ─── Join contest ─────────────────────────────────────────────────────────────
const join = asyncHandler(async (req, res, next) => {
  const contest = await Contest.findById(req.params.id);
  if (!contest) return next(new AppError('Contest not found', 404));

  const now = new Date();
  if (now < contest.startTime) return next(new AppError('Contest has not started yet', 400));
  if (now >= contest.endTime)  return next(new AppError('Contest has ended', 400));

  // Check college scope
  if (contest.scope === 'college') {
    const allowed = contest.allowedColleges.map(id => id.toString());
    if (!allowed.includes(req.user.collegeId?.toString())) {
      return next(new AppError('You are not allowed to join this contest', 403));
    }
  }

  const participant = await joinContest(contest._id, req.userId, req.user.collegeId);
  sendSuccess(res, { message: 'Joined contest', data: participant });
});

// ─── Submit to contest ────────────────────────────────────────────────────────
const submitToContest = asyncHandler(async (req, res, next) => {
  const { id: contestId, problemOrder } = req.params;
  const { code, language, autoSubmitted = false } = req.body;

  const contest = await Contest.findById(contestId);
  if (!contest) return next(new AppError('Contest not found', 404));

  const now = new Date();
  if (now < contest.startTime) return next(new AppError('Contest has not started', 400));
  if (now > contest.endTime)   return next(new AppError('Contest has ended', 400));

  // Find the problem
  const contestProblem = contest.problems.find(p => p.order === Number(problemOrder));
  if (!contestProblem) return next(new AppError('Problem not found in this contest', 404));

  const problem = await Problem.findById(contestProblem.problemId)
    .select('+testCases.hidden');
  if (!problem) return next(new AppError('Problem not found', 404));

  // Sequential unlock check
  if (contest.sequentialUnlock) {
    const participant = await ContestParticipant.findOne({ contestId, userId: req.userId });
    const solved = participant?.solvedOrders ?? [];
    const prevOrder = Number(problemOrder) - 1;
    if (prevOrder > 0 && !solved.includes(prevOrder)) {
      return next(new AppError('You must solve the previous problem first', 400));
    }
  }

  // Count wrong attempts so far on this problem
  const wrongAttempts = await ContestSubmission.countDocuments({
    contestId, userId: req.userId,
    problemId: problem._id, status: { $ne: 'Accepted' },
  });

  // Already solved?
  const alreadySolved = await ContestSubmission.findOne({
    contestId, userId: req.userId, problemId: problem._id, status: 'Accepted',
  });
  if (alreadySolved) return next(new AppError('You already solved this problem', 400));

  // Run through Judge0
  const result = await runSubmission({
    code, language,
    problem,
    userId: req.userId,
  });

  const solveTimeSeconds = result.status === 'Accepted'
    ? Math.floor((now - contest.startTime) / 1000)
    : null;

  const contestSub = await ContestSubmission.create({
    contestId,
    userId:       req.userId,
    collegeId:    req.user.collegeId,
    problemId:    problem._id,
    problemOrder: Number(problemOrder),
    code, language,
    status:            result.status,
    runtime:           result.runtime,
    memory:            result.memory,
    testCasesPassed:   result.testCasesPassed,
    totalTestCases:    result.totalTestCases,
    pointsAwarded:     result.status === 'Accepted' ? contestProblem.points : 0,
    wrongAttemptsBefore: wrongAttempts,
    solveTimeSeconds,
    autoSubmitted,
  });

  // Update participant score
  if (result.status === 'Accepted') {
    await recordResult(contestSub);

    // Emit live leaderboard update via Socket.io
    const io = req.app.get('io');
    if (io) {
      const { emitLeaderboard } = require('../services/contest.service');
      await emitLeaderboard(io, contestId);
    }
  }

  sendSuccess(res, {
    data: {
      status:          result.status,
      runtime:         result.runtime,
      memory:          result.memory,
      testCasesPassed: result.testCasesPassed,
      totalTestCases:  result.totalTestCases,
      pointsAwarded:   contestSub.pointsAwarded,
    },
  });
});

// ─── Contest leaderboard ──────────────────────────────────────────────────────
const getLeaderboard = asyncHandler(async (req, res, next) => {
  const contest = await Contest.findById(req.params.id).lean();
  if (!contest) return next(new AppError('Contest not found', 404));

  const leaderboard = await getContestLeaderboard(req.params.id);

  sendSuccess(res, {
    data: {
      contest: {
        id:     contest._id,
        title:  contest.title,
        status: contest.status,
        isFrozen: contest.status === 'frozen',
        endTime:  contest.endTime,
      },
      leaderboard,
    },
  });
});

// ─── My contest submissions ───────────────────────────────────────────────────
const mySubmissions = asyncHandler(async (req, res) => {
  const subs = await ContestSubmission.find({
    contestId: req.params.id,
    userId:    req.userId,
  })
    .populate('problemId', 'title')
    .sort({ createdAt: -1 })
    .lean();

  sendSuccess(res, { data: subs });
});

module.exports = {
  createContest,
  updateContest,
  deleteContest,
  listContests,
  getContest,
  join,
  submitToContest,
  getLeaderboard,
  mySubmissions,
};
