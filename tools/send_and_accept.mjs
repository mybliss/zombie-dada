import {
  clickText,
  ensureChromeHall,
  ensureEdgeHall,
  ensureStartHall,
  focusWindow,
  inviteFriendByName,
  waitForText,
  waitForTextToDisappear,
} from "./lib/browser_flow.mjs";
import { BROWSERS, CROPS, TIMINGS } from "./lib/config.mjs";
import { now, sleepMs } from "./lib/runtime.mjs";

const friendName = process.argv[2] && !/^\d+$/.test(process.argv[2]) ? process.argv[2] : "";
if (!friendName) {
  console.error("usage: node tools/send_and_accept.mjs <friend_name> [accept_timeout_ms] [poll_ms]");
  process.exit(2);
}
const timeoutArgIndex = 3;
const pollArgIndex = 4;
const timeoutMs = Number.parseInt(process.argv[timeoutArgIndex] || String(TIMINGS.acceptInviteTimeoutMs), 10);
const pollMs = Number.parseInt(process.argv[pollArgIndex] || String(TIMINGS.acceptInvitePollMs), 10);
const timings = {};
const totalStart = now();

focusWindow(BROWSERS.accountA);
sleepMs(TIMINGS.focusSettleMs);
const inviteStageStart = now();
try {
  ensureEdgeHall();
} catch {
  console.error(JSON.stringify({ ok: false, reason: "edge_left_hall_not_ready_before_invite" }, null, 2));
  process.exit(1);
}
inviteFriendByName(friendName);
timings.inviteStageMs = now() - inviteStageStart;

focusWindow(BROWSERS.accountB);
sleepMs(TIMINGS.focusSettleMs);
const acceptStageStart = now();
try {
  ensureChromeHall();
} catch {
  console.error(JSON.stringify({ ok: false, reason: "chrome_right_hall_not_ready_before_accept" }, null, 2));
  process.exit(1);
}

const acceptProbe = waitForText(BROWSERS.accountB, "副本邀请", timeoutMs, pollMs, CROPS.rightInvite);
let acceptResult = null;
if (acceptProbe?.found) {
  try {
    acceptResult = clickText(BROWSERS.accountB, "副本邀请", CROPS.rightInvite);
  } catch {
    acceptResult = null;
  }
}

if (!acceptResult?.ok) {
  console.error(JSON.stringify({ ok: false, reason: "accept_invite_not_found", timeoutMs }, null, 2));
  process.exit(1);
}

const confirmProbe = waitForText(BROWSERS.accountB, "接受", TIMINGS.acceptConfirmTimeoutMs, pollMs, CROPS.rightConfirm);
let confirmResult = null;
if (confirmProbe?.found) {
  try {
    confirmResult = clickText(BROWSERS.accountB, "接受", CROPS.rightConfirm);
  } catch {
    confirmResult = null;
  }
}
if (!confirmResult?.ok) {
  console.error(JSON.stringify({ ok: false, reason: "accept_confirm_not_found" }, null, 2));
  process.exit(1);
}

sleepMs(TIMINGS.postAcceptSettleMs);
const rightRoomReady =
  waitForText(BROWSERS.accountB, "等待开始", TIMINGS.roomWaitLongMs, pollMs) ||
  waitForText(BROWSERS.accountB, "离开", TIMINGS.roomWaitShortMs, pollMs) ||
  waitForText(BROWSERS.accountB, "催促", TIMINGS.roomWaitShortMs, pollMs);
if (!rightRoomReady) {
  console.error(JSON.stringify({ ok: false, reason: "right_chrome_not_in_room_after_accept" }, null, 2));
  process.exit(1);
}
timings.acceptStageMs = now() - acceptStageStart;

sleepMs(TIMINGS.beforeStartSettleMs);
focusWindow(BROWSERS.accountA);
sleepMs(TIMINGS.focusSettleMs);
const startStageStart = now();
try {
  ensureStartHall();
} catch {
  console.error(JSON.stringify({ ok: false, reason: "edge_hall_not_ready_before_start" }, null, 2));
  process.exit(1);
}
const edgeStartProbe =
  waitForText(BROWSERS.accountA, "开始游戏", 2500, pollMs, CROPS.edgeStart) ||
  waitForText(BROWSERS.accountA, "开始", 1500, pollMs, CROPS.edgeStart);
let edgeStartResult = null;
if (edgeStartProbe?.found) {
  try {
    edgeStartResult = clickText(BROWSERS.accountA, "开始游戏", CROPS.edgeStart);
  } catch {
    try {
      edgeStartResult = clickText(BROWSERS.accountA, "开始", CROPS.edgeStart);
    } catch {
      edgeStartResult = null;
    }
  }
}
if (!edgeStartResult?.ok) {
  console.error(JSON.stringify({ ok: false, reason: "edge_start_click_failed" }, null, 2));
  process.exit(1);
}

const edgeStarted =
  waitForTextToDisappear(BROWSERS.accountA, "开始游戏", 8000, pollMs) ||
  waitForTextToDisappear(BROWSERS.accountA, "开始", 8000, pollMs);
if (!edgeStarted) {
  console.error(JSON.stringify({ ok: false, reason: "edge_did_not_leave_hall_after_start" }, null, 2));
  process.exit(1);
}
timings.startStageMs = now() - startStageStart;
timings.totalMs = now() - totalStart;

console.log(JSON.stringify({
  ok: true,
  timings,
  acceptResult,
  confirmResult,
  rightRoomReady,
  edgeStartResult,
  edgeStarted,
}, null, 2));
