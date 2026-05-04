const { getRedis } = require('../config/redis');
const User = require('../models/User');
const College = require('../models/College');
const logger = require('../config/logger');

const LEADERBOARD_TTL = 300; // 5 minutes cache TTL

const OVERALL_LEADERBOARD_KEY = 'leaderboard:overall';

const getLeaderboardKey = (collegeId) => `leaderboard:${collegeId}`;

/**
 * Calculate leaderboard score for a user
 * score = totalSolved + streak bonus (5 per week of streak)
 */
const calculateScore = (user) => {
  const streakBonus = Math.floor(user.streak / 7) * 5;
  return user.totalSolved + streakBonus;
};

/**
 * Add or update a user's score in Redis leaderboard
 */
const upsertUserScore = async (userId, collegeId, score) => {
  try {
    const redis = getRedis();
    const key = getLeaderboardKey(collegeId);
    await redis.zadd(key, score, userId.toString());
    await redis.expire(key, LEADERBOARD_TTL);
  } catch (error) {
    logger.error('Redis upsertUserScore error:', error.message);
  }
};

/**
 * Remove a user from a college leaderboard
 */
const removeUserFromLeaderboard = async (userId, collegeId) => {
  try {
    const redis = getRedis();
    await redis.zrem(getLeaderboardKey(collegeId), userId.toString());
  } catch (error) {
    logger.error('Redis removeUser error:', error.message);
  }
};

/**
 * Get leaderboard for a specific college
 * Returns paginated ranked list with user details
 */
const getCollegeLeaderboard = async (collegeId, { page = 1, limit = 50 } = {}) => {
  const redis = getRedis();
  const key = getLeaderboardKey(collegeId);

  try {
    // Check if leaderboard exists in Redis
    const exists = await redis.exists(key);

    if (!exists) {
      // Build leaderboard from MongoDB
      await buildCollegeLeaderboard(collegeId);
    }

    const offset = (page - 1) * limit;
    const end = offset + limit - 1;

    // ZREVRANGE: highest score first
    const members = await redis.zrevrange(key, offset, end, 'WITHSCORES');
    const totalMembers = await redis.zcard(key);

    if (!members.length) return { data: [], total: 0, page, limit };

    // Parse alternating [member, score, member, score, ...] array
    const userIds = [];
    const scores = {};
    for (let i = 0; i < members.length; i += 2) {
      const uid = members[i];
      const score = parseFloat(members[i + 1]);
      userIds.push(uid);
      scores[uid] = score;
    }

    // Fetch user details from MongoDB
    const users = await User.find({ _id: { $in: userIds } })
      .select('name email totalSolved streak accuracy')
      .lean();

    const userMap = {};
    users.forEach(u => (userMap[u._id.toString()] = u));

    // Build ranked response preserving Redis order
    const ranked = userIds.map((uid, index) => {
      const user = userMap[uid];
      if (!user) return null;
      return {
        rank: offset + index + 1,
        userId: uid,
        name: user.name,
        email: user.email,
        totalSolved: user.totalSolved,
        streak: user.streak,
        accuracy: user.accuracy,
        score: scores[uid],
      };
    }).filter(Boolean);

    return {
      data: ranked,
      total: totalMembers,
      page,
      limit,
      totalPages: Math.ceil(totalMembers / limit),
    };
  } catch (error) {
    logger.error('getCollegeLeaderboard error:', error.message);
    // Fallback to MongoDB
    return getCollegeLeaderboardFromDB(collegeId, { page, limit });
  }
};

/**
 * Build / rebuild Redis leaderboard for a college from MongoDB
 */
const buildCollegeLeaderboard = async (collegeId) => {
  try {
    const redis = getRedis();
    const key = getLeaderboardKey(collegeId);

    const students = await User.find({ collegeId, role: 'student', isActive: true })
      .select('_id totalSolved streak')
      .lean();

    if (!students.length) return;

    const pipeline = redis.pipeline();

    for (const student of students) {
      const score = student.totalSolved + Math.floor(student.streak / 7) * 5;
      pipeline.zadd(key, score, student._id.toString());
    }

    pipeline.expire(key, LEADERBOARD_TTL);
    await pipeline.exec();

    logger.debug(`Built leaderboard for college ${collegeId} with ${students.length} students`);
  } catch (error) {
    logger.error('buildCollegeLeaderboard error:', error.message);
  }
};

/**
 * Rebuild leaderboard after user stats change (college + overall)
 */
const syncUserLeaderboard = async (user) => {
  const score = calculateScore(user);
  await upsertUserScore(user._id, user.collegeId, score);

  // Also update overall leaderboard
  try {
    const redis = getRedis();
    const exists = await redis.exists(OVERALL_LEADERBOARD_KEY);
    if (exists) {
      await redis.zadd(OVERALL_LEADERBOARD_KEY, score, user._id.toString());
      await redis.expire(OVERALL_LEADERBOARD_KEY, LEADERBOARD_TTL);
    }
  } catch (error) {
    logger.error('syncUserLeaderboard (overall) error:', error.message);
  }
};

/**
 * Get leaderboards for ALL colleges (admin)
 */
const getAllLeaderboards = async ({ page = 1, limit = 20 } = {}) => {
  const colleges = await College.find({ isActive: true }).select('_id name code').lean();

  const leaderboards = await Promise.all(
    colleges.map(async (college) => {
      const lb = await getCollegeLeaderboard(college._id, { page: 1, limit: 5 });
      return {
        college: { id: college._id, name: college.name, code: college.code },
        topStudents: lb.data,
        totalStudents: lb.total,
      };
    })
  );

  return leaderboards;
};

/**
 * Get a user's rank in their college leaderboard
 */
const getUserRank = async (userId, collegeId) => {
  try {
    const redis = getRedis();
    const key = getLeaderboardKey(collegeId);

    const exists = await redis.exists(key);
    if (!exists) await buildCollegeLeaderboard(collegeId);

    // ZREVRANK: 0-indexed rank (0 = top)
    const rank = await redis.zrevrank(key, userId.toString());
    const score = await redis.zscore(key, userId.toString());

    if (rank === null) return null;

    return {
      rank: rank + 1,
      score: parseFloat(score || 0),
    };
  } catch (error) {
    logger.error('getUserRank error:', error.message);
    return null;
  }
};

/**
 * Fallback: get leaderboard from MongoDB (no Redis)
 */
const getCollegeLeaderboardFromDB = async (collegeId, { page = 1, limit = 50 } = {}) => {
  const skip = (page - 1) * limit;

  const students = await User.find({ collegeId, role: 'student', isActive: true })
    .select('name email totalSolved streak accuracy')
    .sort({ totalSolved: -1, streak: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await User.countDocuments({ collegeId, role: 'student', isActive: true });

  const data = students.map((student, index) => ({
    rank: skip + index + 1,
    userId: student._id,
    name: student.name,
    email: student.email,
    totalSolved: student.totalSolved,
    streak: student.streak,
    accuracy: student.accuracy,
    score: student.totalSolved + Math.floor(student.streak / 7) * 5,
  }));

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Invalidate a college's leaderboard cache
 */
const invalidateLeaderboard = async (collegeId) => {
  try {
    const redis = getRedis();
    await redis.del(getLeaderboardKey(collegeId));
  } catch (error) {
    logger.error('invalidateLeaderboard error:', error.message);
  }
};

/**
 * Build / rebuild Redis overall leaderboard (all colleges combined)
 */
const buildOverallLeaderboard = async () => {
  try {
    const redis = getRedis();

    const students = await User.find({ role: 'student', isActive: true })
      .select('_id totalSolved streak')
      .lean();

    if (!students.length) return;

    const pipeline = redis.pipeline();

    for (const student of students) {
      const score = student.totalSolved + Math.floor(student.streak / 7) * 5;
      pipeline.zadd(OVERALL_LEADERBOARD_KEY, score, student._id.toString());
    }

    pipeline.expire(OVERALL_LEADERBOARD_KEY, LEADERBOARD_TTL);
    await pipeline.exec();

    logger.debug(`Built overall leaderboard with ${students.length} students`);
  } catch (error) {
    logger.error('buildOverallLeaderboard error:', error.message);
  }
};

/**
 * Get overall leaderboard across all colleges (paginated)
 */
const getOverallLeaderboard = async ({ page = 1, limit = 50 } = {}) => {
  const redis = getRedis();

  try {
    const exists = await redis.exists(OVERALL_LEADERBOARD_KEY);
    if (!exists) await buildOverallLeaderboard();

    const offset = (page - 1) * limit;
    const end = offset + limit - 1;

    const members = await redis.zrevrange(OVERALL_LEADERBOARD_KEY, offset, end, 'WITHSCORES');
    const totalMembers = await redis.zcard(OVERALL_LEADERBOARD_KEY);

    if (!members.length) return { data: [], total: 0, page, limit };

    const userIds = [];
    const scores = {};
    for (let i = 0; i < members.length; i += 2) {
      const uid = members[i];
      const score = parseFloat(members[i + 1]);
      userIds.push(uid);
      scores[uid] = score;
    }

    // Fetch user + college details
    const users = await User.find({ _id: { $in: userIds } })
      .select('name email totalSolved streak accuracy collegeId')
      .populate('collegeId', 'name code')
      .lean();

    const userMap = {};
    users.forEach(u => (userMap[u._id.toString()] = u));

    const ranked = userIds.map((uid, index) => {
      const user = userMap[uid];
      if (!user) return null;
      return {
        rank: offset + index + 1,
        userId: uid,
        name: user.name,
        email: user.email,
        totalSolved: user.totalSolved,
        streak: user.streak,
        accuracy: user.accuracy,
        score: scores[uid],
        college: user.collegeId
          ? { id: user.collegeId._id, name: user.collegeId.name, code: user.collegeId.code }
          : null,
      };
    }).filter(Boolean);

    return {
      data: ranked,
      total: totalMembers,
      page,
      limit,
      totalPages: Math.ceil(totalMembers / limit),
    };
  } catch (error) {
    logger.error('getOverallLeaderboard error:', error.message);
    return getOverallLeaderboardFromDB({ page, limit });
  }
};

/**
 * Fallback: overall leaderboard from MongoDB (no Redis)
 */
const getOverallLeaderboardFromDB = async ({ page = 1, limit = 50 } = {}) => {
  const skip = (page - 1) * limit;

  const students = await User.find({ role: 'student', isActive: true })
    .select('name email totalSolved streak accuracy collegeId')
    .populate('collegeId', 'name code')
    .sort({ totalSolved: -1, streak: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await User.countDocuments({ role: 'student', isActive: true });

  const data = students.map((student, index) => ({
    rank: skip + index + 1,
    userId: student._id,
    name: student.name,
    email: student.email,
    totalSolved: student.totalSolved,
    streak: student.streak,
    accuracy: student.accuracy,
    score: student.totalSolved + Math.floor(student.streak / 7) * 5,
    college: student.collegeId
      ? { id: student.collegeId._id, name: student.collegeId.name, code: student.collegeId.code }
      : null,
  }));

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Get a user's rank in the overall leaderboard
 */
const getUserOverallRank = async (userId) => {
  try {
    const redis = getRedis();

    const exists = await redis.exists(OVERALL_LEADERBOARD_KEY);
    if (!exists) await buildOverallLeaderboard();

    const rank = await redis.zrevrank(OVERALL_LEADERBOARD_KEY, userId.toString());
    const score = await redis.zscore(OVERALL_LEADERBOARD_KEY, userId.toString());

    if (rank === null) return null;

    return {
      rank: rank + 1,
      score: parseFloat(score || 0),
    };
  } catch (error) {
    logger.error('getUserOverallRank error:', error.message);
    return null;
  }
};

/**
 * Invalidate overall leaderboard cache
 */
const invalidateOverallLeaderboard = async () => {
  try {
    const redis = getRedis();
    await redis.del(OVERALL_LEADERBOARD_KEY);
  } catch (error) {
    logger.error('invalidateOverallLeaderboard error:', error.message);
  }
};

module.exports = {
  getCollegeLeaderboard,
  buildCollegeLeaderboard,
  getAllLeaderboards,
  syncUserLeaderboard,
  getUserRank,
  upsertUserScore,
  removeUserFromLeaderboard,
  invalidateLeaderboard,
  calculateScore,
  // Overall leaderboard
  getOverallLeaderboard,
  buildOverallLeaderboard,
  getUserOverallRank,
  invalidateOverallLeaderboard,
};