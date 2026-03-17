import { clickReturn, findReturn } from "./lib/browser_flow.mjs";
import { parseJson, runNodeTool, sleepMs } from "./lib/runtime.mjs";

function waitForBothReturns(timeoutMs, pollMs, initialDelayMs) {
  sleepMs(initialDelayMs);
  const start = Date.now();
  const state = {
    edgeLeft: null,
    chromeRight: null,
  };

  while (Date.now() - start < timeoutMs) {
    if (!state.edgeLeft) {
      const found = findReturn("edge-left");
      if (found?.found) {
        state.edgeLeft = clickReturn("edge-left");
      }
    }

    if (!state.chromeRight) {
      const found = findReturn("chrome-right");
      if (found?.found) {
        state.chromeRight = clickReturn("chrome-right");
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
  cycle.chain = parseJson(runNodeTool("send_and_accept.mjs", [friendName, "15000", "200"]));

  // Give the game a brief moment after A starts, then recover both sides together.
  sleepMs(1000);
  cycle.returnWatch = waitForBothReturns(returnTimeoutMs, returnPollMs, returnInitialDelayMs);
  results.push(cycle);
  console.log(JSON.stringify(cycle, null, 2));
}
