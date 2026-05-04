// Judge0 language IDs
// Full list: https://ce.judge0.com/languages/
const LANGUAGE_IDS = {
  javascript: 63,  // Node.js
  python: 71,      // Python 3
  java: 62,        // Java
  cpp: 54,         // C++ (GCC 9.2.0)
  c: 50,           // C (GCC 9.2.0)
  typescript: 74,  // TypeScript
  go: 60,          // Go
  rust: 73,        // Rust
  ruby: 72,        // Ruby
  csharp: 51,      // C#
};

const LANGUAGE_NAMES = Object.fromEntries(
  Object.entries(LANGUAGE_IDS).map(([name, id]) => [id, name])
);

// Judge0 status codes
const STATUS = {
  IN_QUEUE: 1,
  PROCESSING: 2,
  ACCEPTED: 3,
  WRONG_ANSWER: 4,
  TIME_LIMIT_EXCEEDED: 5,
  COMPILATION_ERROR: 6,
  RUNTIME_ERROR_SIGSEGV: 7,
  RUNTIME_ERROR_SIGXFSZ: 8,
  RUNTIME_ERROR_SIGFPE: 9,
  RUNTIME_ERROR_SIGABRT: 10,
  RUNTIME_ERROR_NZEC: 11,
  RUNTIME_ERROR_OTHER: 12,
  INTERNAL_ERROR: 13,
  EXEC_FORMAT_ERROR: 14,
};

const STATUS_MESSAGES = {
  3: 'Accepted',
  4: 'Wrong Answer',
  5: 'Time Limit Exceeded',
  6: 'Compilation Error',
  7: 'Runtime Error (SIGSEGV)',
  8: 'Runtime Error (SIGXFSZ)',
  9: 'Runtime Error (SIGFPE)',
  10: 'Runtime Error (SIGABRT)',
  11: 'Runtime Error (NZEC)',
  12: 'Runtime Error',
  13: 'Internal Error',
  14: 'Exec Format Error',
};

// Max polling attempts (each 1s)
const MAX_POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 1000;

module.exports = {
  LANGUAGE_IDS,
  LANGUAGE_NAMES,
  STATUS,
  STATUS_MESSAGES,
  MAX_POLL_ATTEMPTS,
  POLL_INTERVAL_MS,
};
