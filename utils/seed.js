require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const College = require('../models/College');
const Problem = require('../models/Problem');

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB for seeding');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      College.deleteMany({}),
      Problem.deleteMany({}),
    ]);
    
    // Safety: Try to drop old problematic indexes
    try {
      await mongoose.connection.collection('problems').dropIndexes();
    } catch (e) {}
    
    console.log('🗑️  Cleared existing data');

    // Create admin
    const admin = await User.create({
      name: 'Platform Admin',
      email: 'admin@platform.com',
      password: 'Admin@123',
      role: 'admin',
    });
    console.log(`👤 Admin created: ${admin.email} / Admin@123`);

    // Create colleges
    const [college1, college2] = await College.create([
      { name: 'Indian Institute of Technology Madras', code: 'IITM' },
      { name: 'National Institute of Technology Trichy', code: 'NITT' },
    ]);
    console.log(`🏫 Colleges created: ${college1.name}, ${college2.name}`);

    // Create students
    const students = await User.create([
      { name: 'Arjun Kumar', email: 'arjun@iitm.ac.in', password: 'Student@123', role: 'student', collegeId: college1._id },
      { name: 'Priya Sharma', email: 'priya@iitm.ac.in', password: 'Student@123', role: 'student', collegeId: college1._id, totalSolved: 5, streak: 3 },
      { name: 'Vikram Nair', email: 'vikram@nitt.ac.in', password: 'Student@123', role: 'student', collegeId: college2._id, totalSolved: 8, streak: 7 },
      { name: 'Sneha Patel', email: 'sneha@nitt.ac.in', password: 'Student@123', role: 'student', collegeId: college2._id, totalSolved: 2, streak: 1 },
    ]);
    console.log(`👥 Students created: ${students.map(s => s.email).join(', ')}`);

    // Update student counts
    await College.findByIdAndUpdate(college1._id, { studentCount: 2 });
    await College.findByIdAndUpdate(college2._id, { studentCount: 2 });

    // Create sample problems
    const problems = await Problem.create([
      {
        title: 'Two Sum',
        difficulty: 'Easy',
        tags: ['array', 'hash-table'],
        description: `Given an array of integers \`nums\` and an integer \`target\`, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.`,
        constraints: `- 2 <= nums.length <= 10^4\n- -10^9 <= nums[i] <= 10^9\n- -10^9 <= target <= 10^9\n- Only one valid answer exists.`,
        examples: [
          { input: 'nums = [2,7,11,15], target = 9', output: '[0,1]', explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].' },
          { input: 'nums = [3,2,4], target = 6', output: '[1,2]' },
        ],
        testCases: {
          sample: [
            { input: '[2,7,11,15]\n9', expectedOutput: '[0,1]' },
            { input: '[3,2,4]\n6', expectedOutput: '[1,2]' },
          ],
          hidden: [
            { input: '[3,3]\n6', expectedOutput: '[0,1]' },
            { input: '[-1,-2,-3,-4,-5]\n-8', expectedOutput: '[2,4]' },
            { input: '[1,2,3,4,5]\n9', expectedOutput: '[3,4]' },
          ],
        },
        starterCode: {
          javascript: `/**\n * @param {number[]} nums\n * @param {number} target\n * @return {number[]}\n */\nvar twoSum = function(nums, target) {\n  // Your solution here\n};`,
          python: `class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        # Your solution here\n        pass`,
          java: `class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        // Your solution here\n    }\n}`,
          cpp: `class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        // Your solution here\n    }\n};`,
        },
        createdBy: admin._id,
        timeLimit: 2000,
        memoryLimit: 256,
      },
      {
        title: 'Valid Parentheses',
        difficulty: 'Easy',
        tags: ['stack', 'string'],
        description: `Given a string s containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.\n\nAn input string is valid if:\n1. Open brackets must be closed by the same type of brackets.\n2. Open brackets must be closed in the correct order.\n3. Every close bracket has a corresponding open bracket of the same type.`,
        constraints: `- 1 <= s.length <= 10^4\n- s consists of parentheses only '()[]{}'.`,
        examples: [
          { input: 's = "()"', output: 'true' },
          { input: 's = "()[]{}"', output: 'true' },
          { input: 's = "(]"', output: 'false' },
        ],
        testCases: {
          sample: [
            { input: '()', expectedOutput: 'true' },
            { input: '()[]{}', expectedOutput: 'true' },
          ],
          hidden: [
            { input: '(]', expectedOutput: 'false' },
            { input: '([)]', expectedOutput: 'false' },
            { input: '{[]}', expectedOutput: 'true' },
            { input: '', expectedOutput: 'true' }, // This will now pass!
          ],
        },
        starterCode: {
          javascript: `/**\n * @param {string} s\n * @return {boolean}\n */\nvar isValid = function(s) {\n    // Your solution here\n};`,
          python: `class Solution:\n    def isValid(self, s: str) -> bool:\n        # Your solution here\n        pass`,
        },
        createdBy: admin._id,
        timeLimit: 1000,
        memoryLimit: 128,
      },
      {
        title: 'Maximum Subarray',
        difficulty: 'Medium',
        tags: ['array', 'dynamic-programming', 'divide-and-conquer'],
        description: `Given an integer array nums, find the subarray with the largest sum, and return its sum.`,
        constraints: `- 1 <= nums.length <= 10^5\n- -10^4 <= nums[i] <= 10^4`,
        examples: [
          { input: 'nums = [-2,1,-3,4,-1,2,1,-5,4]', output: '6', explanation: 'The subarray [4,-1,2,1] has the largest sum 6.' },
          { input: 'nums = [1]', output: '1' },
        ],
        testCases: {
          sample: [
            { input: '[-2,1,-3,4,-1,2,1,-5,4]', expectedOutput: '6' },
            { input: '[1]', expectedOutput: '1' },
          ],
          hidden: [
            { input: '[5,4,-1,7,8]', expectedOutput: '23' },
            { input: '[-1]', expectedOutput: '-1' },
            { input: '[-2,-1]', expectedOutput: '-1' },
          ],
        },
        starterCode: {
          javascript: `/**\n * @param {number[]} nums\n * @return {number}\n */\nvar maxSubArray = function(nums) {\n    // Your solution here\n};`,
          python: `class Solution:\n    def maxSubArray(self, nums: List[int]) -> int:\n        # Your solution here\n        pass`,
        },
        createdBy: admin._id,
        timeLimit: 2000,
        memoryLimit: 256,
      },
    ]);

    console.log(`📝 Problems created: ${problems.map(p => p.title).join(', ')}`);

    console.log('\n🎉 Seed complete!\n');
    console.log('─'.repeat(50));
    console.log('CREDENTIALS:');
    console.log(`  Admin:   admin@platform.com  / Admin@123`);
    console.log(`  Student: arjun@iitm.ac.in   / Student@123`);
    console.log(`  Student: vikram@nitt.ac.in   / Student@123`);
    console.log('─'.repeat(50));

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
};

seed();