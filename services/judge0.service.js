const axios = require('axios');
const logger = require('../config/logger');
const {
  LANGUAGE_IDS,
  STATUS,
  STATUS_MESSAGES,
  MAX_POLL_ATTEMPTS,
  POLL_INTERVAL_MS,
} = require('../config/judge0');

const getJudge0Headers = () => ({
  'Content-Type': 'application/json',
});

const BASE_URL = () => process.env.JUDGE0_API_URL || 'https://judge0-ce.p.rapidapi.com';

/**
 * Encode string to base64 (required by Judge0)
 */
const encodeBase64 = (str) => Buffer.from(str || '').toString('base64');

/**
 * Decode base64 string from Judge0
 */
const decodeBase64 = (str) => {
  if (!str) return '';
  return Buffer.from(str, 'base64').toString('utf-8');
};

/**
 * Submit a single test case to Judge0
 * Returns a token for polling
 */
const submitToJudge0 = async ({ code, language, stdin, expectedOutput, timeLimit, memoryLimit }) => {
  const languageId = LANGUAGE_IDS[language];
  if (!languageId) throw new Error(`Unsupported language: ${language}`);

  const payload = {
    source_code: encodeBase64(code),
    language_id: languageId,
    stdin: encodeBase64(stdin || ''),
    expected_output: expectedOutput ? encodeBase64(expectedOutput) : undefined,
    cpu_time_limit: timeLimit ? timeLimit / 1000 : 2, // Convert ms to seconds
    memory_limit: memoryLimit ? memoryLimit * 1024 : 262144, // Convert MB to KB
    base64_encoded: true,
  };

  try {
    const response = await axios.post(
      `${BASE_URL()}/submissions?base64_encoded=true&wait=false`,
      payload,
      { headers: getJudge0Headers(), timeout: 10000 }
    );
    return response.data.token;
  } catch (error) {
    logger.error('Judge0 submission error:', error.response?.data || error.message);
    throw new Error(
      error.response?.data?.message ||
      JSON.stringify(error.response?.data) ||
      error.message
    );
  }
};

/**
 * Poll Judge0 for result using token
 */
const pollResult = async (token) => {
  let attempts = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    attempts++;

    try {
      const response = await axios.get(
        `${BASE_URL()}/submissions/${token}?base64_encoded=true&fields=stdout,stderr,status,time,memory,compile_output`,
        { headers: getJudge0Headers(), timeout: 8000 }
      );

      const data = response.data;
      const statusId = data.status?.id;

      // Still processing
      if (statusId === STATUS.IN_QUEUE || statusId === STATUS.PROCESSING) {
        logger.debug(`Poll attempt ${attempts}/${MAX_POLL_ATTEMPTS} - Status: ${data.status?.description}`);
        continue;
      }

      // Done - decode and return
      return {
        statusId,
        statusDescription: STATUS_MESSAGES[statusId] || data.status?.description || 'Unknown',
        stdout: decodeBase64(data.stdout),
        stderr: decodeBase64(data.stderr),
        compileOutput: decodeBase64(data.compile_output),
        runtime: data.time ? parseFloat(data.time) * 1000 : null, // Convert to ms
        memory: data.memory || null, // KB
      };
    } catch (error) {
      logger.error(`Poll attempt ${attempts} error:`, error.message);
      if (attempts >= MAX_POLL_ATTEMPTS) throw new Error('Polling timeout');
    }
  }

  throw new Error('Execution timeout - max polling attempts reached');
};

/**
 * Run code against a single test case
 */
const runSingleTestCase = async ({ code, language, testCase, timeLimit, memoryLimit }) => {
  const token = await submitToJudge0({
    code,
    language,
    stdin: testCase.input,
    expectedOutput: testCase.expectedOutput,
    timeLimit,
    memoryLimit,
  });

  const result = await pollResult(token);

  const passed =
    result.statusId === STATUS.ACCEPTED ||
    (result.stdout.trim() === testCase.expectedOutput.trim() && result.statusId === STATUS.WRONG_ANSWER);

  return {
    ...result,
    passed,
    input: testCase.input,
    expectedOutput: testCase.expectedOutput,
    actualOutput: result.stdout,
    token,
  };
};

/**
 * Run code against multiple test cases (batch-style sequential)
 */
const runMultipleTestCases = async ({ code, language, testCases, timeLimit, memoryLimit }) => {
  const results = [];
  let allPassed = true;
  let totalRuntime = 0;
  let maxMemory = 0;

  for (const tc of testCases) {
    const result = await runSingleTestCase({ code, language, testCase: tc, timeLimit, memoryLimit });
    results.push(result);

    if (!result.passed) allPassed = false;
    if (result.runtime) totalRuntime += result.runtime;
    if (result.memory) maxMemory = Math.max(maxMemory, result.memory);

    // Short-circuit on compilation error
    if (result.statusId === STATUS.COMPILATION_ERROR) {
      allPassed = false;
      break;
    }
  }

  const passedCount = results.filter(r => r.passed).length;
  const overallStatus = determineOverallStatus(results, allPassed);

  return {
    results,
    allPassed,
    passedCount,
    totalTestCases: testCases.length,
    overallStatus,
    avgRuntime: results.length > 0 ? Math.round(totalRuntime / results.length) : 0,
    maxMemory,
  };
};

/**
 * Determine overall submission status from results
 */
const determineOverallStatus = (results, allPassed) => {
  if (allPassed) return 'Accepted';

  const statusIds = results.map(r => r.statusId);

  if (statusIds.includes(STATUS.COMPILATION_ERROR)) return 'Compilation Error';
  if (statusIds.includes(STATUS.TIME_LIMIT_EXCEEDED)) return 'Time Limit Exceeded';
  if (
    statusIds.some(id => [
      STATUS.RUNTIME_ERROR_SIGSEGV,
      STATUS.RUNTIME_ERROR_SIGXFSZ,
      STATUS.RUNTIME_ERROR_SIGFPE,
      STATUS.RUNTIME_ERROR_SIGABRT,
      STATUS.RUNTIME_ERROR_NZEC,
      STATUS.RUNTIME_ERROR_OTHER,
    ].includes(id))
  ) {
    return 'Runtime Error';
  }
  if (statusIds.includes(STATUS.INTERNAL_ERROR)) return 'Internal Error';

  return 'Wrong Answer';
};

module.exports = {
  submitToJudge0,
  pollResult,
  runSingleTestCase,
  runMultipleTestCases,
};
