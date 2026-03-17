import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function sh(script, args = []) {
  return execFileSync(script, args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function runNode(script, args = []) {
  return execFileSync("node", [path.join(repoRoot, "tools", script), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitForOcrText(browser, text, timeoutMs, pollMs, cropArgs = []) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const result = JSON.parse(runNode("find_text_in_browser.mjs", [browser, text, ...cropArgs]));
      if (result.found) {
        return result;
      }
    } catch {
      // keep polling
    }
    sleepMs(pollMs);
  }
  return null;
}

function waitForText(browser, text, timeoutMs, pollMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = JSON.parse(runNode("find_text_in_browser.mjs", [browser, text]));
    if (result.found) {
      return result;
    }
    sleepMs(pollMs);
  }
  return null;
}

function waitForTextToDisappear(browser, text, timeoutMs, pollMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = JSON.parse(runNode("find_text_in_browser.mjs", [browser, text]));
    if (!result.found) {
      return { ok: true, disappeared: true };
    }
    sleepMs(pollMs);
  }
  return null;
}

function now() {
  return Date.now();
}

const friendName = process.argv[2] && !/^\d+$/.test(process.argv[2]) ? process.argv[2] : "";
if (!friendName) {
  console.error("usage: node tools/send_and_accept.mjs <friend_name> [accept_timeout_ms] [poll_ms]");
  process.exit(2);
}
const timeoutArgIndex = 3;
const pollArgIndex = 4;
const timeoutMs = Number.parseInt(process.argv[timeoutArgIndex] || "15000", 10);
const pollMs = Number.parseInt(process.argv[pollArgIndex] || "200", 10);
const rightInviteCrop = ["--x", "500", "--y", "850", "--w", "1100", "--h", "1050"];
const rightConfirmCrop = ["--x", "450", "--y", "650", "--w", "1300", "--h", "1100"];
const edgeStartCrop = ["--x", "450", "--y", "1700", "--w", "650", "--h", "420"];
const timings = {};
const totalStart = now();

sh(path.join(repoRoot, "tools", "focus_game_window.sh"), ["edge-left"]);
sleepMs(250);
const inviteStageStart = now();
try {
  runNode("ensure_edge_left_hall.mjs");
} catch {
  console.error(JSON.stringify({ ok: false, reason: "edge_left_hall_not_ready_before_invite" }, null, 2));
  process.exit(1);
}
runNode("invite_friend_by_name.mjs", [friendName]);
timings.inviteStageMs = now() - inviteStageStart;

sh(path.join(repoRoot, "tools", "focus_game_window.sh"), ["chrome-right"]);
sleepMs(250);
const acceptStageStart = now();
try {
  runNode("ensure_chrome_right_hall.mjs");
} catch {
  console.error(JSON.stringify({ ok: false, reason: "chrome_right_hall_not_ready_before_accept" }, null, 2));
  process.exit(1);
}

const acceptProbe = waitForOcrText("chrome-right", "副本邀请", timeoutMs, pollMs, rightInviteCrop);
let acceptResult = null;
if (acceptProbe?.found) {
  try {
    acceptResult = JSON.parse(runNode("click_text_in_browser.mjs", ["chrome-right", "副本邀请", ...rightInviteCrop]));
  } catch {
    acceptResult = null;
  }
}

if (!acceptResult?.ok) {
  console.error(JSON.stringify({ ok: false, reason: "accept_invite_not_found", timeoutMs }, null, 2));
  process.exit(1);
}

const confirmProbe = waitForOcrText("chrome-right", "接受", 5000, pollMs, rightConfirmCrop);
let confirmResult = null;
if (confirmProbe?.found) {
  try {
    confirmResult = JSON.parse(runNode("click_text_in_browser.mjs", ["chrome-right", "接受", ...rightConfirmCrop]));
  } catch {
    confirmResult = null;
  }
}
if (!confirmResult?.ok) {
  console.error(JSON.stringify({ ok: false, reason: "accept_confirm_not_found" }, null, 2));
  process.exit(1);
}

sleepMs(500);
const rightRoomReady =
  waitForOcrText("chrome-right", "等待开始", 1800, pollMs) ||
  waitForOcrText("chrome-right", "离开", 1200, pollMs) ||
  waitForOcrText("chrome-right", "催促", 1200, pollMs);
if (!rightRoomReady) {
  console.error(JSON.stringify({ ok: false, reason: "right_chrome_not_in_room_after_accept" }, null, 2));
  process.exit(1);
}
timings.acceptStageMs = now() - acceptStageStart;

sleepMs(800);
sh(path.join(repoRoot, "tools", "focus_game_window.sh"), ["edge-left"]);
sleepMs(250);
const startStageStart = now();
try {
  runNode("ensure_hall_before_start.mjs");
} catch {
  console.error(JSON.stringify({ ok: false, reason: "edge_hall_not_ready_before_start" }, null, 2));
  process.exit(1);
}
const edgeStartProbe =
  waitForOcrText("edge-left", "开始游戏", 2500, pollMs, edgeStartCrop) ||
  waitForOcrText("edge-left", "开始", 1500, pollMs, edgeStartCrop);
let edgeStartResult = null;
if (edgeStartProbe?.found) {
  try {
    edgeStartResult = JSON.parse(runNode("click_text_in_browser.mjs", ["edge-left", "开始游戏", ...edgeStartCrop]));
  } catch {
    try {
      edgeStartResult = JSON.parse(runNode("click_text_in_browser.mjs", ["edge-left", "开始", ...edgeStartCrop]));
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
  waitForTextToDisappear("edge-left", "开始游戏", 8000, pollMs) ||
  waitForTextToDisappear("edge-left", "开始", 8000, pollMs);
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
