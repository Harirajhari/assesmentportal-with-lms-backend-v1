const mongoose = require('mongoose');

const contestProblemSchema = new mongoose.Schema({
  problemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem',
    required: true,
  },
  order: { type: Number, required: true },   // 1-based display order
  points: { type: Number, default: 100 },    // Points awarded for solving
}, { _id: false });

const contestSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Contest title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: { type: String, default: '' },

    // Who can participate
    // 'all' = all colleges, 'college' = specific colleges only
    scope: {
      type: String,
      enum: ['all', 'college'],
      default: 'all',
    },
    allowedColleges: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
    }],

    problems: {
      type: [contestProblemSchema],
      validate: {
        validator: arr => arr.length >= 1,
        message: 'At least one problem required',
      },
    },

    startTime: { type: Date, required: true },
    endTime:   { type: Date, required: true },

    // Leaderboard freezes this many minutes before end (0 = never freeze)
    freezeMinutes: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['draft', 'upcoming', 'live', 'frozen', 'ended'],
      default: 'draft',
    },

    // Problems unlock in sequence (must solve #1 before seeing #2)
    sequentialUnlock: { type: Boolean, default: false },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Virtual: is the leaderboard currently frozen?
contestSchema.virtual('isFrozen').get(function () {
  if (!this.freezeMinutes) return false;
  const freezeAt = new Date(this.endTime.getTime() - this.freezeMinutes * 60 * 1000);
  return new Date() >= freezeAt && new Date() < this.endTime;
});

// Compute status from times
contestSchema.methods.computeStatus = function () {
  const now = new Date();
  if (now < this.startTime) return 'upcoming';
  if (now >= this.endTime)  return 'ended';
  if (this.freezeMinutes) {
    const freezeAt = new Date(this.endTime.getTime() - this.freezeMinutes * 60 * 1000);
    if (now >= freezeAt) return 'frozen';
  }
  return 'live';
};

contestSchema.index({ startTime: 1 });
contestSchema.index({ status: 1 });
contestSchema.index({ allowedColleges: 1 });

module.exports = mongoose.model('Contest', contestSchema);