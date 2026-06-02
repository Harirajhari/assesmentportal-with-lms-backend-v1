const mongoose = require('mongoose');

// One document per calendar day — admin schedules which problem to show
const dailyChallengeSchema = new mongoose.Schema(
  {
    date: {
      type: String, // 'YYYY-MM-DD' — easy to query, timezone-safe
      required: true,
      unique: true,
    },
    problemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Problem',
      required: true,
    },
    scheduledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

dailyChallengeSchema.index({ date: 1 });

module.exports = mongoose.model('DailyChallenge', dailyChallengeSchema);