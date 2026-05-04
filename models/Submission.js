const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema(
  {
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
    code: {
      type: String,
      required: [true, 'Code is required'],
      maxlength: [65536, 'Code too large'],
    },
    language: {
      type: String,
      enum: ['javascript', 'python', 'java', 'cpp', 'c', 'typescript', 'go', 'rust', 'ruby', 'csharp'],
      required: true,
    },
    status: {
      type: String,
      enum: [
        'Accepted',
        'Wrong Answer',
        'Time Limit Exceeded',
        'Runtime Error',
        'Compilation Error',
        'Memory Limit Exceeded',
        'Pending',
        'Internal Error',
      ],
      default: 'Pending',
    },
    runtime: {
      type: Number, // ms
      default: null,
    },
    memory: {
      type: Number, // KB
      default: null,
    },
    stdout: { type: String, default: '' },
    stderr: { type: String, default: '' },
    compileOutput: { type: String, default: '' },
    testCasesPassed: {
      type: Number,
      default: 0,
    },
    totalTestCases: {
      type: Number,
      default: 0,
    },
    judgeToken: {
      type: String, // Judge0 token for polling
      select: false,
    },
    isFirstAccepted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.judgeToken;
        return ret;
      },
    },
  }
);

submissionSchema.index({ userId: 1, problemId: 1 });
submissionSchema.index({ collegeId: 1, createdAt: -1 });
submissionSchema.index({ status: 1 });
submissionSchema.index({ problemId: 1, status: 1 });

module.exports = mongoose.model('Submission', submissionSchema);
