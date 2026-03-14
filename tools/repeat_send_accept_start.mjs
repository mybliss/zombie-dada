import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function runNode(script, args = []) {
  return execFileSync("node", [path.join(repoRoot, "tools", script), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function tryFindReturn(browser) {
  const cropArgs = browser === "chrome-right"
    ? ["--x", "0", "--y", "1200", "--w", "1000", "--h", "900"]
    : ["--x", "0", "--y", "1200", "--w", "1000", "--h", "900"];
  try {
    return JSON.parse(runNode("find_text_in_browser.mjs", [browser, "返回", ...cropArgs]));
  } catch {
    return null;
  }
}

function tryClickReturn(browser) {
  const cropArgs = browser === "chrome-right"
    ? ["--x", "0", "--y", "1200", "--w", "1000", "--h", "900"]
    : ["--x", "0", "--y", "1200", "--w", "1000", "--h", "900"];
  try {
    return JSON.parse(runNode("click_text_in_browser.mjs", [browser, "返回", ...cropArgs]));
  } catch {
    return null;
  }
}

function waitForBothReturns(timeoutMs, pollMs, initialDelayMs) {
  sleepMs(initialDelayMs);
  const start = Date.now();
  const state = {
    edgeLeft: null,
    chromeRight: null,
  };

  while (Date.now() - start < timeoutMs) {
    if (!state.edgeLeft) {
      const found = tryFindReturn("edge-left");
      if (found?.found) {
        state.edgeLeft = tryClickReturn("edge-left");
      }
    }

    if (!state.chromeRight) {
      const found = tryFindReturn("chrome-right");
      if (found?.found) {
        state.chromeRight = tryClickReturn("chrome-right");
      }
    }

    if (state.edgeLeft?.ok && state.chromeRight?.ok) {
      return {
        ok: true,
        edgeLeft: state.edgeLeft,
        chromeRight: state.chromeRight,
      };
    }

    sleepMs(pollMs);
  }

  throw new Error(JSON.stringify({
    ok: false,
    reason: "return_not_found_for_both",
    edgeLeft: state.edgeLeft,
    chromeRight: state.chromeRight,
    timeoutMs,
  }, null, 2));
}

const friendName = process.argv[2];
if (!friendName) {
  console.error("usage: node tools/repeat_send_accept_start.mjs <friend_name> [rounds] [return_timeout_ms]");
  process.exit(2);
}

const rounds = Number.parseInt(process.argv[3] || "999999", 10);
const returnTimeoutMs = Number.parseInt(process.argv[4] || "600000", 10);
const returnPollMs = Number.parseInt(process.argv[5] || "5000", 10);
const returnInitialDelayMs = Number.parseInt(process.argv[6] || "300000", 10);

const results = [];

for (let round = 1; round <= rounds; round += 1) {
  const cycle = { round };
  cycle.chain = JSON.parse(runNode("send_and_accept.mjs", [friendName, "15000", "200"]));

  // Give the game a brief moment after A starts, then recover both sides together.
  sleepMs(1000);
  cycle.returnWatch = waitForBothReturns(returnTimeoutMs, returnPollMs, returnInitialDelayMs);
  results.push(cycle);
  console.log(JSON.stringify(cycle, null, 2));
}
