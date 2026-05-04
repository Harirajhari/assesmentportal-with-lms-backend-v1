const mongoose = require('mongoose');

const collegeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'College name is required'],
      unique: true,
      trim: true,
      minlength: [2, 'College name must be at least 2 characters'],
      maxlength: [150, 'College name cannot exceed 150 characters'],
    },
    code: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    studentCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Auto-generate college code from name
collegeSchema.pre('save', function (next) {
  if (!this.code) {
    this.code = this.name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .substring(0, 8) + '_' + Date.now().toString(36).toUpperCase();
  }
  next();
});

collegeSchema.index({ name: 'text' });

module.exports = mongoose.model('College', collegeSchema);
