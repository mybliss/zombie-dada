import { findAndClickReturn } from "../lib/browser_flow.mjs";
import { TIMINGS } from "../lib/config.mjs";
import { logRound, logStepError, logStepOk, logStepStart } from "../lib/logger.mjs";
import { formatMarkedResult, parseMarkedResult, runNodeTool, sleepMs, tryParseJson } from "../lib/runtime.mjs";

function waitForBothReturns(timeoutMs, pollMs, initialDelayMs) {
  sleepMs(initialDelayMs);
  const start = Date.now();
  const state = {
    edgeLeft: null,
    chromeRight: null,
  };

  while (Date.now() - start < timeoutMs) {
    if (!state.edgeLeft) {
      const result = findAndClickReturn("edge-left");
      if (result?.ok) state.edgeLeft = result;
    }

    if (!state.chromeRight) {
      const result = findAndClickReturn("chrome-right");
      if (result?.ok) state.chromeRight = result;
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
  console.error("usage: node tools/flows/repeat_send_accept_start.mjs <friend_name> [rounds] [return_timeout_ms]");
  process.exit(2);
}

const rounds = Number.parseInt(process.argv[3] || "999999", 10);
const returnTimeoutMs = Number.parseInt(process.argv[4] || "600000", 10);
const returnPollMs = Number.parseInt(process.argv[5] || "5000", 10);
const returnInitialDelayMs = Number.parseInt(process.argv[6] || "300000", 10);

const results = [];

for (let round = 1; round <= rounds; round += 1) {
  const cycle = { round };
  logRound(round, "start", { friendName });
  logStepStart("round_send_and_accept", { round, friendName });
  try {
    cycle.chain = parseMarkedResult(runNodeTool("flows/send_and_accept.mjs", [
      friendName,
      String(TIMINGS.acceptInviteTimeoutMs),
      String(TIMINGS.acceptInvitePollMs),
    ]));
    logStepOk("round_send_and_accept", { round, timings: cycle.chain.timings });
  } catch (error) {
    const payload = tryParseJson(error.stderr?.trim?.() || "") || { ok: false, reason: "round_send_and_accept_failed" };
    logStepError("round_send_and_accept", { round, error: payload.reason ?? error.message });
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }

  // Give the game a brief moment after A starts, then recover both sides together.
  sleepMs(TIMINGS.postStartSettleMs);
  logStepStart("round_wait_for_returns", { round });
  cycle.returnWatch = waitForBothReturns(returnTimeoutMs, returnPollMs, returnInitialDelayMs);
  logStepOk("round_wait_for_returns", { round, returnWatch: cycle.returnWatch });
  results.push(cycle);
  logRound(round, "completed", { timings: cycle.chain.timings });
  console.log(formatMarkedResult(cycle));
}
