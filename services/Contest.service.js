const Contest = require('../models/Contest');
const ContestParticipant = require('../models/ContestParticipant');
const ContestSubmission = require('../models/ContestSubmission');
const logger = require('../config/logger');

const PENALTY_PER_WRONG = 20; // minutes per wrong attempt (ICPC style)

/**
 * Register or return a participant entry
 */
const joinContest = async (contestId, userId, collegeId) => {
  const existing = await ContestParticipant.findOne({ contestId, userId });
  if (existing) return existing;

  return ContestParticipant.create({ contestId, userId, collegeId });
};

/**
 * After a ContestSubmission is judged, update the participant's score.
 * Returns updated participant.
 */
const recordResult = async (contestSubmission) => {
  const { contestId, userId, problemOrder, status, pointsAwarded, solveTimeSeconds } = contestSubmission;

  const participant = await ContestParticipant.findOne({ contestId, userId });
  if (!participant) return null;

  const key = String(problemOrder);
  const stats = participant.problemStats.get(key) || {
    solved: false, attempts: 0, solveTimeSeconds: null, pointsAwarded: 0,
  };

  // Increment attempt count
  stats.attempts += 1;

  if (status === 'Accepted' && !stats.solved) {
    // First accepted — award points
    stats.solved = true;
    stats.solveTimeSeconds = solveTimeSeconds;
    stats.pointsAwarded = pointsAwarded;

    participant.totalPoints += pointsAwarded;
    participant.solvedOrders.push(problemOrder);

    // Add penalty: solve time in minutes + 20 min per prior wrong attempt
    const solveMinutes = Math.floor(solveTimeSeconds / 60);
    const wrongPenalty = (stats.attempts - 1) * PENALTY_PER_WRONG;
    participant.penaltyMinutes += solveMinutes + wrongPenalty;
  }

  participant.problemStats.set(key, stats);
  await participant.save();

  return participant;
};

/**
 * Build the contest leaderboard (sorted by totalPoints DESC, penaltyMinutes ASC)
 * If contest is frozen, only include solves that happened before freeze time.
 */
const getContestLeaderboard = async (contestId) => {
  const contest = await Contest.findById(contestId).lean();
  if (!contest) return [];

  const isFrozen = contest.status === 'frozen' || contest.status === 'ended';
  const freezeAt = contest.freezeMinutes
    ? new Date(contest.endTime.getTime() - contest.freezeMinutes * 60 * 1000)
    : null;

  const participants = await ContestParticipant.find({ contestId })
    .populate('userId', 'name email')
    .populate('collegeId', 'name code')
    .lean();

  // If leaderboard is frozen and contest is not ended yet, only show
  // solves that happened before freeze time (hide last N minutes)
  let ranked = participants;

  if (contest.status === 'frozen' && freezeAt) {
    // For frozen state: recalculate scores using only pre-freeze submissions
    const preFreezeSubmissions = await ContestSubmission.find({
      contestId,
      status: 'Accepted',
      createdAt: { $lt: freezeAt },
    }).lean();

    const solvedByUser = {};
    preFreezeSubmissions.forEach(s => {
      const uid = s.userId.toString();
      if (!solvedByUser[uid]) solvedByUser[uid] = new Set();
      solvedByUser[uid].add(s.problemOrder);
    });

    ranked = participants.map(p => {
      const uid = p.userId._id.toString();
      const preFreezeOrders = solvedByUser[uid] || new Set();
      let frozenPoints = 0;
      let frozenPenalty = 0;

      for (const [key, stats] of Object.entries(p.problemStats)) {
        const order = Number(key);
        if (preFreezeOrders.has(order)) {
          frozenPoints += stats.pointsAwarded;
          const solveMin = Math.floor(stats.solveTimeSeconds / 60);
          const wrongPen = (stats.attempts - 1) * PENALTY_PER_WRONG;
          frozenPenalty += solveMin + wrongPen;
        }
      }

      return { ...p, totalPoints: frozenPoints, penaltyMinutes: frozenPenalty };
    });
  }

  // Sort: most points first, then least penalty
  ranked.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    return a.penaltyMinutes - b.penaltyMinutes;
  });

  return ranked.map((p, i) => ({
    rank: i + 1,
    userId:        p.userId._id ?? p.userId,
    name:          p.userId.name ?? '—',
    email:         p.userId.email ?? '',
    college:       p.collegeId ? { name: p.collegeId.name, code: p.collegeId.code } : null,
    totalPoints:   p.totalPoints,
    penaltyMinutes: p.penaltyMinutes,
    solvedCount:   p.solvedOrders?.length ?? 0,
    solvedOrders:  p.solvedOrders ?? [],
    problemStats:  Object.fromEntries(
      Object.entries(p.problemStats ?? {}).map(([k, v]) => [k, v])
    ),
  }));
};

/**
 * Emit the updated leaderboard via Socket.io
 */
const emitLeaderboard = async (io, contestId) => {
  try {
    const leaderboard = await getContestLeaderboard(contestId);
    io.to(`contest:${contestId}`).emit('leaderboard:update', {
      contestId,
      leaderboard,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('emitLeaderboard error:', err.message);
  }
};

/**
 * Auto-update contest statuses (call on cron or server startup)
 */
const syncContestStatuses = async () => {
  const contests = await Contest.find({
    status: { $in: ['upcoming', 'live', 'frozen'] },
  });

  for (const contest of contests) {
    const computed = contest.computeStatus();
    if (computed !== contest.status) {
      contest.status = computed;
      await contest.save();
      logger.info(`Contest ${contest._id} status -> ${computed}`);
    }
  }
};

module.exports = {
  joinContest,
  recordResult,
  getContestLeaderboard,
  emitLeaderboard,
  syncContestStatuses,
};