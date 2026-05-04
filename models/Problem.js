const mongoose = require('mongoose');

const testCaseSchema = new mongoose.Schema({
  input: { 
    type: String, 
    // Change 'required: true' to this to allow empty strings ""
    validate: {
      validator: (v) => typeof v === 'string',
      message: 'Input must be a string'
    }
  },
  expectedOutput: { type: String, required: true },
  explanation: { type: String },
}, { _id: true });

const exampleSchema = new mongoose.Schema({
  input: { type: String, required: true },
  output: { type: String, required: true },
  explanation: { type: String },
}, { _id: false });

const starterCodeSchema = new mongoose.Schema({
  javascript: { type: String, default: '// Your solution here\n' },
  python: { type: String, default: '# Your solution here\n' },
  java: { type: String, default: '// Your solution here\n' },
  cpp: { type: String, default: '// Your solution here\n' },
  c: { type: String, default: '// Your solution here\n' },
}, { _id: false });

const problemSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Problem title is required'],
      unique: true,
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    difficulty: {
      type: String,
      enum: ['Easy', 'Medium', 'Hard'],
      required: [true, 'Difficulty is required'],
    },
    tags: [{
      type: String,
      trim: true,
      lowercase: true,
    }],
    description: {
      type: String,
      required: [true, 'Problem description is required'],
    },
    constraints: {
      type: String,
      required: [true, 'Constraints are required'],
    },
    examples: {
      type: [exampleSchema],
      validate: {
        validator: arr => arr.length >= 1,
        message: 'At least one example is required',
      },
    },
    testCases: {
      sample: {
        type: [testCaseSchema],
        validate: {
          validator: arr => arr.length >= 1,
          message: 'At least one sample test case required',
        },
      },
      hidden: {
        type: [testCaseSchema],
        validate: {
          validator: arr => arr.length >= 1,
          message: 'At least one hidden test case required',
        },
        select: false, // Never expose hidden test cases in API
      },
    },
    starterCode: starterCodeSchema,
    isActive: { type: Boolean, default: true },
    acceptanceRate: { type: Number, default: 0 },
    totalSubmissions: { type: Number, default: 0 },
    totalAccepted: { type: Number, default: 0 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    timeLimit: {
      type: Number,
      default: 2000, // ms
    },
    memoryLimit: {
      type: Number,
      default: 256, // MB
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Auto-generate slug from title
problemSchema.pre('save', function (next) {
  if (this.isModified('title') || !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
  next();
});

// Update acceptance rate
problemSchema.methods.updateAcceptanceRate = function () {
  if (this.totalSubmissions > 0) {
    this.acceptanceRate = parseFloat(
      ((this.totalAccepted / this.totalSubmissions) * 100).toFixed(2)
    );
  }
};

problemSchema.index({ title: 'text' }); 
problemSchema.index({ tags: 1 });
problemSchema.index({ difficulty: 1, isActive: 1 });

module.exports = mongoose.model('Problem', problemSchema);
