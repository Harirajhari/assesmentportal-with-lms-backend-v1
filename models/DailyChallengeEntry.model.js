const mongoose = require('mongoose');

// One document per user per day they completed the challenge
const dailyChallengeEntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: String, // 'YYYY-MM-DD'
      required: true,
    },
    problemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Problem',
      required: true,
    },
    submissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Submission',
      required: true,
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// One completion per user per day
dailyChallengeEntrySchema.index({ userId: 1, date: 1 }, { unique: true });
dailyChallengeEntrySchema.index({ date: 1 });

module.exports = mongoose.model('DailyChallengeEntry', dailyChallengeEntrySchema);