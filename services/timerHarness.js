/**
 * wrapWithTimer(code, language)
 *
 * Wraps the user's solution in a timing harness so the algorithm's
 * own execution time is printed to stdout as:  __exec_time__:1.234
 *
 * The backend then parses this out of stdout and returns it as
 * result.algoRuntime (ms, float).
 *
 * This gives LeetCode-style "your code ran in X ms" — isolating the
 * algorithm time from JVM/interpreter startup noise.
 */

const TIMER_TEMPLATES = {

  java: (code) => {
    // Inject timing around the body of main()
    // Strategy: rename user's Main → __UserSolution, call it from a new Main
    // that times it.
    const renamed = code
      .replace(/public\s+class\s+Main/, 'class __UserSolution')
      .replace(/public\s+static\s+void\s+main\s*\(\s*String\s*\[\s*\]\s*\w+\s*\)/, 'public static void main(String[] args)')

    return `
${renamed}

public class Main {
    public static void main(String[] args) throws Exception {
        // Warmup pass (optional, reduces JIT noise on first real call)
        long _start = System.nanoTime();
        __UserSolution.main(args);
        long _elapsed = System.nanoTime() - _start;
        // Print algo time in ms, 3 decimal places
        System.err.println("__exec_time__:" + String.format("%.3f", _elapsed / 1_000_000.0));
    }
}
`
  },

  python: (code) => `
import time as __time
import sys as __sys

def __run():
${code.split('\n').map(l => '    ' + l).join('\n')}

__t0 = __time.perf_counter()
__run()
__t1 = __time.perf_counter()
print(f"__exec_time__:{(__t1-__t0)*1000:.3f}", file=__sys.stderr)
`,

  javascript: (code) => `
const __t0 = process.hrtime.bigint();
(function() {
${code}
})();
const __elapsed = Number(process.hrtime.bigint() - __t0) / 1e6;
process.stderr.write("__exec_time__:" + __elapsed.toFixed(3) + "\\n");
`,

  cpp: (code) => {
    // Inject #include <chrono> and wrap main
    const withoutMain = code.replace(/int\s+main\s*\([^)]*\)\s*\{/, '__USER_MAIN_PLACEHOLDER__')
    return `
#include <bits/stdc++.h>
#include <chrono>
using namespace std;
using namespace std::chrono;

${withoutMain.replace('__USER_MAIN_PLACEHOLDER__', `
int __user_main();
int main() {
    auto __t0 = high_resolution_clock::now();
    int __r = __user_main();
    auto __t1 = high_resolution_clock::now();
    double __ms = duration<double,milli>(__t1-__t0).count();
    fprintf(stderr, "__exec_time__:%.3f\\n", __ms);
    return __r;
}
int __user_main() {`)}
`
  },

  c: (code) => {
    const withoutMain = code.replace(/int\s+main\s*\([^)]*\)\s*\{/, '__USER_MAIN_PLACEHOLDER__')
    return `
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

${withoutMain.replace('__USER_MAIN_PLACEHOLDER__', `
int __user_main();
int main() {
    struct timespec __t0, __t1;
    clock_gettime(CLOCK_MONOTONIC, &__t0);
    int __r = __user_main();
    clock_gettime(CLOCK_MONOTONIC, &__t1);
    double __ms = (__t1.tv_sec - __t0.tv_sec)*1000.0 + (__t1.tv_nsec - __t0.tv_nsec)/1e6;
    fprintf(stderr, "__exec_time__:%.3f\\n", __ms);
    return __r;
}
int __user_main() {`)}
`
  },

  // Go: wrap main in a timer
  go: (code) => code
    .replace('func main() {', `
import "time"

func main() {
    __t0 := time.Now()
    defer func() {
        __ms := float64(time.Since(__t0).Microseconds()) / 1000.0
        _, _ = fmt.Fprintf(os.Stderr, "__exec_time__:%.3f\\n", __ms)
    }()
`),

  rust: (code) => code
    .replace('fn main() {', `
fn main() {
    let __t0 = std::time::Instant::now();
    let __result = (|| {
`).replace(/\}\s*$/, `
    })();
    let __ms = __t0.elapsed().as_secs_f64() * 1000.0;
    eprintln!("__exec_time__:{:.3}", __ms);
    __result
}`),
}

/**
 * Wrap user code with timing harness.
 * Falls back to returning original code if language not supported.
 */
function wrapWithTimer(code, language) {
  const wrapper = TIMER_TEMPLATES[language]
  if (!wrapper) return { code, hasTimer: false }
  try {
    return { code: wrapper(code), hasTimer: true }
  } catch {
    return { code, hasTimer: false }
  }
}

/**
 * Parse __exec_time__ out of Judge0's stderr.
 * Returns ms as a float, or null if not found.
 */
function parseAlgoRuntime(stderr) {
  if (!stderr) return null
  const match = stderr.match(/__exec_time__:([\d.]+)/)
  return match ? parseFloat(match[1]) : null
}

module.exports = { wrapWithTimer, parseAlgoRuntime }
