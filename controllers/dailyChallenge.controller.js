const DailyChallenge      = require('../models/DailyChallenge.model');
const DailyChallengeEntry = require('../models/DailyChallengeEntry.model');
const Submission          = require('../models/Submission');
const User                = require('../models/User');
const Problem             = require('../models/Problem');
const { sendSuccess }     = require('../utils/response');
const AppError            = require('../utils/AppError');
const asyncHandler        = require('../utils/asyncHandler');
const { runMultipleTestCases } = require('../services/judge0.service');

// ── Helper: get today's date string in IST (or UTC — pick one, stay consistent) ──
const todayStr = () => {
  const now = new Date();
  // Using IST (UTC+5:30) — change offset if needed
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10); // 'YYYY-MM-DD'
};

// ── Helper: recalculate streak for a user ────────────────────────────────────
const recalcStreak = async (userId) => {
  // Get all completed dates sorted descending
  const entries = await DailyChallengeEntry.find({ userId })
    .sort({ date: -1 })
    .select('date')
    .lean();

  if (!entries.length) {
    await User.findByIdAndUpdate(userId, { currentStreak: 0, longestStreak: 0, lastChallengeDate: null });
    return { currentStreak: 0, longestStreak: 0 };
  }

  const dates = entries.map(e => e.date); // ['2026-06-01', '2026-05-31', ...]
  const today = todayStr();

  // Current streak: consecutive days ending today or yesterday
  let currentStreak = 0;
  let cursor = today;

  for (const date of dates) {
    if (date === cursor) {
      currentStreak++;
      // Move cursor back one day
      const d = new Date(cursor);
      d.setDate(d.getDate() - 1);
      cursor = d.toISOString().slice(0, 10);
    } else if (date < cursor) {
      // Gap — streak broken
      break;
    }
  }

  // Longest streak: scan all dates
  let longest = 0;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const curr = new Date(dates[i]);
    const diff = (prev - curr) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      run++;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }
  longest = Math.max(longest, run);

  await User.findByIdAndUpdate(userId, {
    currentStreak,
    longestStreak:    Math.max(longest, currentStreak),
    lastChallengeDate: dates[0],
  });

  return { currentStreak, longestStreak: Math.max(longest, currentStreak) };
};

// ─── GET /api/daily  ──────────────────────────────────────────────────────────
// Returns today's challenge + whether current user has completed it
const getToday = asyncHandler(async (req, res, next) => {
  const today = todayStr();

  const challenge = await DailyChallenge.findOne({ date: today })
    .populate('problemId', 'title difficulty description constraints examples tags timeLimit memoryLimit starterCode acceptanceRate')
    .lean();

  if (!challenge) {
    return next(new AppError('No daily challenge scheduled for today', 404));
  }

  // Has this user already completed today's challenge?
  const entry = await DailyChallengeEntry.findOne({ userId: req.userId, date: today }).lean();

  // User's streak info
  const user = await User.findById(req.userId).select('currentStreak longestStreak lastChallengeDate').lean();

  sendSuccess(res, {
    data: {
      date:         today,
      problem:      challenge.problemId,
      completed:    !!entry,
      completedAt:  entry?.completedAt ?? null,
      currentStreak:  user?.currentStreak  ?? 0,
      longestStreak:  user?.longestStreak  ?? 0,
    },
  });
});

// ─── POST /api/daily/submit  ──────────────────────────────────────────────────
// Submit code for today's daily challenge
const submitDaily = asyncHandler(async (req, res, next) => {
  const today = todayStr();
  const { code, language } = req.body;

  if (!code || !language) return next(new AppError('Code and language are required', 400));

  // Get today's challenge
  const challenge = await DailyChallenge.findOne({ date: today }).lean();
  if (!challenge) return next(new AppError('No daily challenge for today', 404));

  // Already completed?
  const existing = await DailyChallengeEntry.findOne({ userId: req.userId, date: today }).lean();
  if (existing) return next(new AppError('You already completed today\'s challenge', 400));

  // Get problem with test cases
  const problem = await Problem.findById(challenge.problemId).select('+testCases.hidden').lean();
  if (!problem) return next(new AppError('Problem not found', 404));

  // Run all test cases through Judge0
  const allCases = [...(problem.testCases?.sample ?? []), ...(problem.testCases?.hidden ?? [])]
  const result = await runMultipleTestCases({
    code, language,
    testCases:   allCases,
    timeLimit:   problem.timeLimit,
    memoryLimit: problem.memoryLimit,
  });

  // Save submission
  const submission = await Submission.create({
    userId:          req.userId,
    collegeId:       req.user.collegeId,
    problemId:       problem._id,
    code,
    language,
    status:          result.overallStatus,
    runtime:         result.avgRuntime,
    memory:          result.maxMemory,
    testCasesPassed: result.passedCount,
    totalTestCases:  result.totalTestCases,
    stdout:          result.results?.[0]?.stdout ?? '',
    stderr:          result.results?.[0]?.stderr ?? '',
    compileOutput:   result.results?.[0]?.compileOutput ?? '',
  });

  let streakInfo = null;

  // Only mark complete + update streak on Accepted
  if (result.overallStatus === 'Accepted') {
    await DailyChallengeEntry.create({
      userId:       req.userId,
      date:         today,
      problemId:    problem._id,
      submissionId: submission._id,
    });

    streakInfo = await recalcStreak(req.userId);
  }

  sendSuccess(res, {
    data: {
      status:          result.overallStatus,
      runtime:         result.avgRuntime,
      memory:          result.maxMemory,
      testCasesPassed: result.passedCount,
      totalTestCases:  result.totalTestCases,
      pointsAwarded:   result.overallStatus === 'Accepted' ? 10 : 0,
      streak:          streakInfo,
    },
  });
});

// ─── GET /api/daily/streak  ───────────────────────────────────────────────────
// Get current user's streak info + last 30 days completion history
const getStreak = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId)
    .select('currentStreak longestStreak lastChallengeDate')
    .lean();

  // Last 30 days completion map
  const entries = await DailyChallengeEntry.find({ userId: req.userId })
    .sort({ date: -1 })
    .limit(30)
    .select('date completedAt')
    .lean();

  sendSuccess(res, {
    data: {
      currentStreak:   user?.currentStreak  ?? 0,
      longestStreak:   user?.longestStreak  ?? 0,
      lastChallengeDate: user?.lastChallengeDate ?? null,
      history: entries.map(e => ({ date: e.date, completedAt: e.completedAt })),
    },
  });
});

// ─── GET /api/daily/calendar  ────────────────────────────────────────────────
// Get scheduled challenges for a month (admin + student use)
const getCalendar = asyncHandler(async (req, res) => {
  const { month, year } = req.query; // e.g. month=6&year=2026
  const now = new Date();
  const m = String(month ?? now.getMonth() + 1).padStart(2, '0');
  const y = year ?? now.getFullYear();

  const from = `${y}-${m}-01`;
  const to   = `${y}-${m}-31`;

  const challenges = await DailyChallenge.find({ date: { $gte: from, $lte: to } })
    .populate('problemId', 'title difficulty')
    .sort({ date: 1 })
    .lean();

  // For student: mark which days they completed
  const completedDates = new Set();
  if (req.user.role === 'student') {
    const entries = await DailyChallengeEntry.find({
      userId: req.userId,
      date:   { $gte: from, $lte: to },
    }).select('date').lean();
    entries.forEach(e => completedDates.add(e.date));
  }

  sendSuccess(res, {
    data: challenges.map(c => ({
      date:      c.date,
      problem:   c.problemId,
      completed: completedDates.has(c.date),
    })),
  });
});

// ─── ADMIN: POST /api/admin/daily/schedule  ───────────────────────────────────
// Schedule a problem for a specific date (or batch of dates)
const schedule = asyncHandler(async (req, res, next) => {
  const { schedules } = req.body;
  // schedules = [{ date: '2026-06-02', problemId: '...' }, ...]

  if (!Array.isArray(schedules) || !schedules.length) {
    return next(new AppError('schedules array is required', 400));
  }

  // Validate all problem IDs exist
  const problemIds = [...new Set(schedules.map(s => s.problemId))];
  const found = await Problem.find({ _id: { $in: problemIds }, isActive: true }).select('_id');
  if (found.length !== problemIds.length) {
    return next(new AppError('One or more problem IDs are invalid', 400));
  }

  // Upsert each schedule
  const ops = schedules.map(({ date, problemId }) => ({
    updateOne: {
      filter: { date },
      update: { $set: { date, problemId, scheduledBy: req.userId } },
      upsert: true,
    },
  }));

  await DailyChallenge.bulkWrite(ops);

  sendSuccess(res, { message: `${schedules.length} day(s) scheduled` });
});

// ─── ADMIN: DELETE /api/admin/daily/:date  ────────────────────────────────────
const unschedule = asyncHandler(async (req, res, next) => {
  const deleted = await DailyChallenge.findOneAndDelete({ date: req.params.date });
  if (!deleted) return next(new AppError('No challenge scheduled for this date', 404));
  sendSuccess(res, { message: 'Challenge removed' });
});

// ─── ADMIN: GET /api/admin/daily/stats  ──────────────────────────────────────
const adminStats = asyncHandler(async (req, res) => {
  const today = todayStr();

  const [totalScheduled, completedToday, topStreaks] = await Promise.all([
    DailyChallenge.countDocuments({ date: { $gte: today } }), // upcoming + today
    DailyChallengeEntry.countDocuments({ date: today }),
    User.find({ currentStreak: { $gt: 0 } })
      .sort({ currentStreak: -1 })
      .limit(10)
      .select('name currentStreak longestStreak')
      .lean(),
  ]);

  sendSuccess(res, { data: { totalScheduled, completedToday, topStreaks } });
});

module.exports = {
  getToday,
  submitDaily,
  getStreak,
  getCalendar,
  schedule,
  unschedule,
  adminStats,
};