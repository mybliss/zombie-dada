import {
  ensureChromeHall,
  ensureEdgeHall,
  ensureStartHall,
  focusWindow,
  inviteFriendByName,
  waitAndClickText,
  waitForAnyText,
  waitForTextToDisappear,
} from "../lib/browser_flow.mjs";
import { BROWSERS, CROPS, TIMINGS } from "../lib/config.mjs";
import { logStepError, logStepOk, logStepStart } from "../lib/logger.mjs";
import { formatMarkedResult, now, sleepMs } from "../lib/runtime.mjs";

const friendName = process.argv[2] && !/^\d+$/.test(process.argv[2]) ? process.argv[2] : "";
if (!friendName) {
  console.error("usage: node tools/flows/send_and_accept.mjs <friend_name> [accept_timeout_ms] [poll_ms]");
  process.exit(2);
}
const timeoutArgIndex = 3;
const pollArgIndex = 4;
const timeoutMs = Number.parseInt(process.argv[timeoutArgIndex] || String(TIMINGS.acceptInviteTimeoutMs), 10);
const pollMs = Number.parseInt(process.argv[pollArgIndex] || String(TIMINGS.acceptInvitePollMs), 10);
const timings = {};
const totalStart = now();

function fail(step, reason, extra = {}) {
  logStepError(step, { reason, ...extra });
  console.error(JSON.stringify({ ok: false, reason, ...extra }, null, 2));
  process.exit(1);
}

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

logStepStart("accept_invite");
const acceptResult = waitAndClickText(BROWSERS.accountB, "副本邀请", timeoutMs, pollMs, CROPS.rightInvite);
if (!acceptResult?.ok) {
  fail("accept_invite", "accept_invite_not_found", { timeoutMs });
}
logStepOk("accept_invite", { acceptResult });

logStepStart("accept_confirm");
const confirmResult = waitAndClickText(BROWSERS.accountB, "接受", TIMINGS.acceptConfirmTimeoutMs, pollMs, CROPS.rightConfirm);
if (!confirmResult?.ok) {
  fail("accept_confirm", "accept_confirm_not_found");
}
logStepOk("accept_confirm", { confirmResult });

sleepMs(TIMINGS.postAcceptSettleMs);
logStepStart("accept_room_ready");
const rightRoomReady = waitForAnyText(
  BROWSERS.accountB,
  ["等待开始", "离开", "催促"],
  TIMINGS.roomWaitLongMs,
  pollMs,
);
if (!rightRoomReady) {
  fail("accept_room_ready", "right_chrome_not_in_room_after_accept");
}
timings.acceptStageMs = now() - acceptStageStart;
logStepOk("accept_room_ready", { durationMs: timings.acceptStageMs, rightRoomReady });

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

logStepStart("start_click");
const edgeStartResult =
  waitAndClickText(BROWSERS.accountA, "开始游戏", 2500, pollMs, CROPS.edgeStart) ||
  waitAndClickText(BROWSERS.accountA, "开始", 1500, pollMs, CROPS.edgeStart);
if (!edgeStartResult?.ok) {
  fail("start_click", "edge_start_click_failed");
}
logStepOk("start_click", { edgeStartResult });

logStepStart("start_confirm");
const edgeStarted =
  waitForTextToDisappear(BROWSERS.accountA, "开始游戏", 8000, pollMs) ||
  waitForTextToDisappear(BROWSERS.accountA, "开始", 8000, pollMs);
if (!edgeStarted) {
  fail("start_confirm", "edge_did_not_leave_hall_after_start");
}
timings.startStageMs = now() - startStageStart;
timings.totalMs = now() - totalStart;
logStepOk("start_confirm", { durationMs: timings.startStageMs, edgeStarted });
logStepOk("send_and_accept", { durationMs: timings.totalMs, friendName, timings });

console.log(formatMarkedResult({
  ok: true,
  timings,
  acceptResult,
  confirmResult,
  rightRoomReady,
  edgeStartResult,
  edgeStarted,
}));
