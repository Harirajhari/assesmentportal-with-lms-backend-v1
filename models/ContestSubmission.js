const mongoose = require('mongoose');

// Tracks every submission made during a contest
const contestSubmissionSchema = new mongoose.Schema(
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
    problemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Problem',
      required: true,
    },
    problemOrder: { type: Number, required: true },  // which problem (1,2,3...)

    code:     { type: String, required: true, maxlength: 65536 },
    language: {
      type: String,
      enum: ['javascript', 'python', 'java', 'cpp', 'c'],
      required: true,
    },
    status: {
      type: String,
      enum: ['Accepted', 'Wrong Answer', 'Time Limit Exceeded',
             'Runtime Error', 'Compilation Error', 'Memory Limit Exceeded',
             'Pending', 'Internal Error'],
      default: 'Pending',
    },

    // Points awarded (only set when Accepted)
    pointsAwarded: { type: Number, default: 0 },

    // Penalty: number of wrong attempts before this submission
    wrongAttemptsBefore: { type: Number, default: 0 },

    // Time from contest start in seconds (used for tiebreaker)
    solveTimeSeconds: { type: Number, default: null },

    runtime: { type: Number, default: null },
    memory:  { type: Number, default: null },
    testCasesPassed: { type: Number, default: 0 },
    totalTestCases:  { type: Number, default: 0 },

    // Was this auto-submitted when time ran out?
    autoSubmitted: { type: Boolean, default: false },

    judgeToken: { type: String, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) { delete ret.judgeToken; return ret; }
    },
  }
);

contestSubmissionSchema.index({ contestId: 1, userId: 1 });
contestSubmissionSchema.index({ contestId: 1, problemId: 1 });
contestSubmissionSchema.index({ contestId: 1, userId: 1, problemId: 1 });
contestSubmissionSchema.index({ contestId: 1, status: 1 });

module.exports = mongoose.model('ContestSubmission', contestSubmissionSchema);
