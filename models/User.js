const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['admin', 'student'],
      default: 'student',
    },
    collegeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: function () {
        return this.role === 'student';
      },
    },

    // ── Statistics ────────────────────────────────────────────────────────────
    totalSolved: {
      type: Number,
      default: 0,
      min: 0,
    },
    // General submission streak (any problem, any day)
    streak: {
      type: Number,
      default: 0,
      min: 0,
    },
    accuracy: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    totalSubmissions: {
      type: Number,
      default: 0,
    },
    lastSubmissionDate: {
      type: Date,
    },

    // ── Daily Challenge streak (separate from general streak) ─────────────────
    currentStreak: {
      type: Number,
      default: 0,
      min: 0,
    },
    longestStreak: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastChallengeDate: {
      type: String,   // 'YYYY-MM-DD' — matches DailyChallengeEntry.date
      default: null,
    },

    // ── Auth ──────────────────────────────────────────────────────────────────
    refreshToken: {
      type: String,
      select: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    solvedProblems: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Problem',
    }],
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        delete ret.refreshToken;
        return ret;
      },
    },
  }
);

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Leaderboard score — now includes daily challenge streak bonus too
userSchema.methods.getLeaderboardScore = function () {
  const submissionStreakBonus = Math.floor(this.streak / 7) * 5;       // 5 pts per 7-day submission streak
  const dailyStreakBonus      = Math.floor(this.currentStreak / 7) * 10; // 10 pts per 7-day daily streak
  return this.totalSolved + submissionStreakBonus + dailyStreakBonus;
};

// Update accuracy
userSchema.methods.updateAccuracy = function () {
  this.totalSubmissions += 1;
  this.accuracy = parseFloat(
    ((this.totalSolved / this.totalSubmissions) * 100).toFixed(2)
  );
};

// General submission streak (unchanged)
userSchema.methods.updateStreak = function () {
  const now  = new Date();
  const last = this.lastSubmissionDate;

  if (!last) {
    this.streak = 1;
  } else {
    const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      // Already submitted today — no change
    } else if (diffDays === 1) {
      this.streak += 1; // Consecutive day
    } else {
      this.streak = 1;  // Reset
    }
  }

  this.lastSubmissionDate = now;
};

userSchema.index({ collegeId: 1 });
userSchema.index({ totalSolved: -1 });
userSchema.index({ currentStreak: -1 }); // for streak leaderboard queries

module.exports = mongoose.model('User', userSchema);