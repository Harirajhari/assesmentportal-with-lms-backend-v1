const mongoose = require('mongoose');

// One document per (contest, user) — updated in real time
const contestParticipantSchema = new mongoose.Schema(
  {
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contest',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    collegeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: true,
    },

    // Live score = sum of pointsAwarded for solved problems
    totalPoints: { type: Number, default: 0 },

    // Total penalty minutes (ICPC style: wrong attempts * 20 min each)
    penaltyMinutes: { type: Number, default: 0 },

    // Which problem orders have been solved  e.g. [1, 3]
    solvedOrders: [{ type: Number }],

    // Per-problem tracking  { "1": { solved, attempts, solveTimeSeconds, pointsAwarded } }
    problemStats: {
      type: Map,
      of: new mongoose.Schema({
        solved:           { type: Boolean, default: false },
        attempts:         { type: Number,  default: 0 },
        solveTimeSeconds: { type: Number,  default: null },
        pointsAwarded:    { type: Number,  default: 0 },
      }, { _id: false }),
      default: {},
    },

    // Joined at (when they first opened the contest)
    joinedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

contestParticipantSchema.index({ contestId: 1, userId: 1 }, { unique: true });
contestParticipantSchema.index({ contestId: 1, totalPoints: -1, penaltyMinutes: 1 });

module.exports = mongoose.model('ContestParticipant', contestParticipantSchema);