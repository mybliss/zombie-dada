import {
  ensureChromeHall,
  ensureEdgeHall,
  ensureStartHall,
  focusWindow,
  inviteFriendByName,
} from "../lib/browser_flow.mjs";
import { BROWSERS, TIMINGS } from "../lib/config.mjs";
import { logStepError, logStepOk, logStepStart } from "../lib/logger.mjs";
import {
  inviteMatcher,
  performStep,
  textMatcher,
  waitForCondition,
  waitForStableTextAndClick,
} from "../lib/robust_ocr.mjs";
import { formatMarkedResult, now, sleepMs } from "../lib/runtime.mjs";

const friendName = process.argv[2] && !/^\d+$/.test(process.argv[2]) ? process.argv[2] : "";
if (!friendName) {
  console.error("usage: node tools/flows/send_and_accept.mjs <friend_name> [accept_timeout_ms] [poll_ms]");
  process.exit(2);
}
const timeoutMs = Number.parseInt(process.argv[3] || String(TIMINGS.acceptInviteTimeoutMs), 10);
const pollMs = Number.parseInt(process.argv[4] || String(TIMINGS.acceptInvitePollMs), 10);
const timings = {};
const totalStart = now();

function fail(step, reason, extra = {}) {
  logStepError(step, { reason, ...extra });
  console.error(JSON.stringify({ ok: false, reason, ...extra }, null, 2));
  process.exit(1);
}

// --- A: prepare + invite ----------------------------------------------------
logStepStart("invite_prepare", { friendName });
focusWindow(BROWSERS.accountA);
sleepMs(TIMINGS.focusSettleMs);
const inviteStageStart = now();
try {
  ensureEdgeHall();
} catch {
  fail("invite_prepare", "edge_left_hall_not_ready_before_invite");
}
logStepOk("invite_prepare");

logStepStart("invite_friend", { friendName });
inviteFriendByName(friendName);
timings.inviteStageMs = now() - inviteStageStart;
logStepOk("invite_friend", { durationMs: timings.inviteStageMs });

// --- B: accept --------------------------------------------------------------
logStepStart("accept_prepare");
focusWindow(BROWSERS.accountB);
sleepMs(TIMINGS.focusSettleMs);
const acceptStageStart = now();
try {
  ensureChromeHall();
} catch {
  fail("accept_prepare", "chrome_right_hall_not_ready_before_accept");
}
logStepOk("accept_prepare");

// Click "副本邀请" then verify the accept dialog ("接受") shows, retrying.
logStepStart("accept_invite");
const acceptStep = performStep({
  name: "accept_invite",
  browser: BROWSERS.accountB,
  clickTarget: {
    name: "dungeon_invite",
    match: textMatcher(["副本邀请", "副本"]),
    region: { xMin: 0.2, xMax: 0.98, yMin: 0.3, yMax: 0.95 },
    minConfidence: 0.25,
    requiredHits: 2,
    maxClusterDistancePx: 90,
  },
  clickOptions: { timeoutMs, pollMs },
  postClickDelayMs: 400,
  verify: { anyText: ["接受", "接收"] },
  verifyTimeoutMs: 3000,
  attempts: 3,
});
if (!acceptStep.ok) {
  fail("accept_invite", "accept_invite_not_found", { timeoutMs, detail: acceptStep });
}
logStepOk("accept_invite", { acceptStep });

// Click "接受" then verify B entered the room ("等待开始"/"离开"/"催促").
logStepStart("accept_confirm");
const confirmStep = performStep({
  name: "accept_confirm",
  browser: BROWSERS.accountB,
  clickTarget: {
    name: "accept_button",
    match: textMatcher(["接受", "接收"]),
    region: { xMin: 0.3, xMax: 0.95, yMin: 0.25, yMax: 0.85 },
    minConfidence: 0.3,
    requiredHits: 2,
    maxClusterDistancePx: 80,
  },
  clickOptions: { timeoutMs: TIMINGS.acceptConfirmTimeoutMs, pollMs },
  postClickDelayMs: TIMINGS.postAcceptSettleMs,
  verify: { anyText: ["等待开始", "离开", "催促"] },
  verifyTimeoutMs: TIMINGS.roomWaitLongMs + 1500,
  attempts: 3,
});
if (!confirmStep.ok) {
  fail("accept_confirm", "accept_confirm_not_found", { detail: confirmStep });
}
logStepOk("accept_confirm", { confirmStep });

logStepStart("accept_room_ready");
const rightRoomReady = waitForCondition(
  BROWSERS.accountB,
  { anyText: ["等待开始", "离开", "催促"] },
  { timeoutMs: TIMINGS.roomWaitLongMs, pollMs },
);
if (!rightRoomReady.ok) {
  fail("accept_room_ready", "right_chrome_not_in_room_after_accept");
}
timings.acceptStageMs = now() - acceptStageStart;
logStepOk("accept_room_ready", { durationMs: timings.acceptStageMs, rightRoomReady });

// --- A: start ---------------------------------------------------------------
logStepStart("start_prepare");
focusWindow(BROWSERS.accountA);
sleepMs(TIMINGS.focusSettleMs);
const startStageStart = now();
try {
  ensureStartHall();
} catch {
  fail("start_prepare", "edge_hall_not_ready_before_start");
}
logStepOk("start_prepare");

// Click "开始游戏" then verify it left the hall (button disappears / battle UI).
logStepStart("start_click");
const startStep = performStep({
  name: "start_click",
  browser: BROWSERS.accountA,
  clickTarget: {
    name: "start_game",
    match: textMatcher(["开始游戏", "开始"]),
    region: { xMin: 0.25, xMax: 0.85, yMin: 0.85, yMax: 1.0 },
    minConfidence: 0.3,
    requiredHits: 2,
    maxClusterDistancePx: 90,
  },
  clickOptions: { timeoutMs: 4000, pollMs },
  postClickDelayMs: TIMINGS.postStartSettleMs,
  verify: { anyText: ["返回", "离开", "暂停", "击杀", "波次"] },
  verifyTimeoutMs: 9000,
  attempts: 3,
});
if (!startStep.ok) {
  // Fallback verify: the start button is simply gone (battle started without
  // recognizable battle text yet).
  const stillInHall = waitForStableTextAndClick(
    BROWSERS.accountA,
    {
      name: "start_game_probe",
      match: textMatcher(["开始游戏", "开始"]),
      region: { xMin: 0.25, xMax: 0.85, yMin: 0.85, yMax: 1.0 },
      minConfidence: 0.3,
      requiredHits: 2,
    },
    { timeoutMs: 1500, pollMs, dryRun: true },
  );
  if (stillInHall.clicked) {
    fail("start_confirm", "edge_did_not_leave_hall_after_start", { detail: startStep });
  }
}
timings.startStageMs = now() - startStageStart;
timings.totalMs = now() - totalStart;
logStepOk("start_click", { startStep });
logStepOk("send_and_accept", { durationMs: timings.totalMs, friendName, timings });

console.log(formatMarkedResult({
  ok: true,
  timings,
  acceptStep,
  confirmStep,
  rightRoomReady,
  startStep,
}));
