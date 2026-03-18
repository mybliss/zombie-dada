import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { BROWSERS, INVITE_FLOW, TIMINGS } from "../lib/config.mjs";
import { normalizeText, runCommand, runTool, sleepMs } from "../lib/runtime.mjs";
import { getDisplayScale, getWindowBounds } from "../lib/screen.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const targetName = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!targetName) {
  console.error("usage: node tools/flows/invite_friend_by_name.mjs <friend_name> [--dry-run]");
  process.exit(2);
}

const screenshotPath = "/tmp/invite_friend_by_name.png";
const ocrBin = "/tmp/ocr_text";
const keepDebugImages = process.env.KEEP_DEBUG_IMAGES === "1";

function cleanupScreenshot() {
  if (keepDebugImages) return;
  try { fs.unlinkSync(screenshotPath); } catch {}
}

function ensureOcrTool() {
  if (fs.existsSync(ocrBin)) return;
  execFileSync("xcrun", [
    "--sdk", "macosx", "swiftc",
    path.join(repoRoot, "tools", "native", "ocr_text.swift"),
    "-framework", "Vision", "-framework", "AppKit",
    "-o", ocrBin,
  ], { cwd: repoRoot, encoding: "utf8" });
}

function normalizeFriendText(value) {
  return normalizeText(value).replace(/服/g, "");
}

function clickScreenPoint(screenX, screenY) {
  if (!fs.existsSync("/tmp/chrome_click")) {
    throw new Error("/tmp/chrome_click not found; compile tools/native/chrome_click.swift first");
  }
  execFileSync("/tmp/chrome_click", [
    Math.round(screenX).toString(),
    Math.round(screenY).toString(),
  ], { cwd: repoRoot, encoding: "utf8" });
}

function clickPoint(point) {
  const bounds = getWindowBounds(BROWSERS.accountA);
  const scale = getDisplayScale();
  const screenX = bounds.left + point.centerX / scale;
  const screenY = bounds.top + point.centerY / scale;
  if (!dryRun) clickScreenPoint(screenX, screenY);
  return { screenX, screenY };
}

function captureAndOcr() {
  runTool("system/focus_game_window.sh", [BROWSERS.accountA]);
  sleepMs(TIMINGS.focusSettleMs);
  runTool("system/capture_browser_window.sh", [BROWSERS.accountA, screenshotPath]);
  ensureOcrTool();
  return JSON.parse(runCommand(ocrBin, [screenshotPath]));
}

function findBestTextLine(lines, name) {
  const normalizedTarget = normalizeFriendText(name);
  let best = null;
  for (const line of lines) {
    const normalizedLine = normalizeFriendText(line.text);
    if (!normalizedLine) continue;
    const contains =
      normalizedLine.includes(normalizedTarget) || normalizedTarget.includes(normalizedLine);
    if (!contains) continue;
    const score = Math.min(normalizedLine.length, normalizedTarget.length) + line.confidence;
    if (!best || score > best.score) {
      best = { ...line, score };
    }
  }
  return best;
}

function findNearestInvite(lines, targetCenterY) {
  const exact = lines.filter((line) => normalizeText(line.text) === "邀请");
  const candidates = exact.length > 0
    ? exact
    : lines.filter((line) => {
      const t = normalizeText(line.text);
      return t.includes("邀请") && !t.includes("邀请码") && !t.includes("输入") && t.length <= 6;
    });
  if (candidates.length === 0) return null;
  let nearest = candidates[0];
  let minDist = Math.abs(candidates[0].centerY - targetCenterY);
  for (const line of candidates) {
    const dist = Math.abs(line.centerY - targetCenterY);
    if (dist < minDist) {
      minDist = dist;
      nearest = line;
    }
  }
  return nearest;
}

function detectPopupTabs(lines) {
  const recommend = lines.filter((line) => normalizeText(line.text) === "推荐");
  const friends = lines.filter((line) => normalizeText(line.text) === "好友");
  if (recommend.length === 0 || friends.length === 0) return null;
  const recTab = recommend.reduce((a, b) => (a.centerY > b.centerY ? a : b));
  const friTab = friends.reduce((a, b) => (a.centerY > b.centerY ? a : b));
  if (Math.abs(recTab.centerY - friTab.centerY) > 100) return null;
  return { recommend: recTab, friends: friTab };
}

function ensureFriendsList() {
  let ocr = captureAndOcr();
  let bestLine = findBestTextLine(ocr.lines, targetName);
  if (bestLine) return { ocr, bestLine };

  let tabs = detectPopupTabs(ocr.lines);
  if (tabs) {
    for (let i = 0; i < INVITE_FLOW.popupFriendsRetryCount; i += 1) {
      clickPoint(tabs.friends);
      sleepMs(TIMINGS.inviteFriendsTabSettleMs);
      ocr = captureAndOcr();
      bestLine = findBestTextLine(ocr.lines, targetName);
      if (bestLine) return { ocr, bestLine };
      tabs = detectPopupTabs(ocr.lines);
    }
    return { ocr, bestLine: findBestTextLine(ocr.lines, targetName) };
  }

  const isHallInvite = (line) => {
    const t = normalizeText(line.text);
    return t.includes("邀请") && !t.includes("邀请码") && !t.includes("输入");
  };
  const hallInvite =
    ocr.lines.find((line) => normalizeText(line.text) === "邀请") ||
    ocr.lines.find(isHallInvite);
  if (hallInvite) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      clickPoint(hallInvite);
      sleepMs(TIMINGS.invitePopupOpenSettleMs);
      ocr = captureAndOcr();
      tabs = detectPopupTabs(ocr.lines);
      if (tabs) break;
    }

    if (tabs) {
      for (let i = 0; i < INVITE_FLOW.popupFriendsRetryCount; i += 1) {
        clickPoint(tabs.friends);
        sleepMs(TIMINGS.invitePopupOpenSettleMs);
        ocr = captureAndOcr();
        bestLine = findBestTextLine(ocr.lines, targetName);
        if (bestLine) return { ocr, bestLine };
        tabs = detectPopupTabs(ocr.lines);
      }
    }
  }

  return { ocr, bestLine: findBestTextLine(ocr.lines, targetName) };
}

const { ocr, bestLine } = ensureFriendsList();

if (!bestLine) {
  console.error(JSON.stringify({
    ok: false,
    reason: "friend_name_not_found",
    targetName,
    ocrLines: ocr.lines.slice(0, 20),
  }, null, 2));
  process.exit(1);
}

const inviteButton = findNearestInvite(ocr.lines, bestLine.centerY);

if (!inviteButton) {
  console.error(JSON.stringify({
    ok: false,
    reason: "invite_button_not_found_near_friend",
    targetName,
    bestLine,
    ocrLines: ocr.lines.slice(0, 20),
  }, null, 2));
  process.exit(1);
}

const { screenX, screenY } = clickPoint(inviteButton);
cleanupScreenshot();

console.log(JSON.stringify({
  ok: true,
  targetName,
  dryRun,
  bestLine,
  inviteButton,
  screenX: Number(screenX.toFixed(2)),
  screenY: Number(screenY.toFixed(2)),
}, null, 2));
