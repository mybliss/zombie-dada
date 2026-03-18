import fs from "fs";
import { CROPS, RECOVERY } from "./config.mjs";
import {
  captureCropAndOcr,
  findTextInBrowser,
  findTextLine,
  clickTextInBrowser,
  parseCropArgs,
} from "./ocr_session.mjs";
import { ensureRecoveryState } from "./recovery.mjs";
import { parseJson, runNodeTool, runTool, sleepMs } from "./runtime.mjs";
import { clickImagePoint } from "./screen.mjs";

const keepDebugImages = process.env.KEEP_DEBUG_IMAGES === "1";

function cleanupFiles(...paths) {
  if (keepDebugImages) return;
  for (const p of paths) {
    if (!p) continue;
    try { fs.unlinkSync(p); } catch {}
  }
}

// Convert CLI-style crop args ["--x","500","--y","850",...] to { x, y, w, h }
function resolveCrop(browser, cropArgs) {
  const argMap = new Map();
  for (let i = 0; i < cropArgs.length; i += 2) {
    if (cropArgs[i]?.startsWith("--")) {
      argMap.set(cropArgs[i], cropArgs[i + 1]);
    }
  }
  return parseCropArgs(browser, argMap).crop;
}

export function focusWindow(target) {
  runTool("system/focus_game_window.sh", [target]);
}

export function ensureEdgeHall() {
  return ensureRecoveryState(RECOVERY.edgeLeftHall);
}

export function ensureChromeHall() {
  return ensureRecoveryState(RECOVERY.chromeRightHall);
}

export function ensureStartHall() {
  return ensureRecoveryState(RECOVERY.edgeStartHall);
}

export function inviteFriendByName(friendName) {
  return parseJson(runNodeTool("flows/invite_friend_by_name.mjs", [friendName]));
}

export function findText(browser, text, cropArgs = []) {
  const crop = resolveCrop(browser, cropArgs);
  return findTextInBrowser(browser, text, crop);
}

export function clickText(browser, text, cropArgs = []) {
  const crop = resolveCrop(browser, cropArgs);
  return clickTextInBrowser(browser, text, crop);
}

export function waitForText(browser, text, timeoutMs, pollMs, cropArgs = []) {
  const crop = resolveCrop(browser, cropArgs);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const result = findTextInBrowser(browser, text, crop);
      if (result.found) return result;
    } catch {
      // keep polling
    }
    sleepMs(pollMs);
  }
  return null;
}

// Combined wait + click: reuses the same screenshot for both find and click
export function waitAndClickText(browser, text, timeoutMs, pollMs, cropArgs = []) {
  const crop = resolveCrop(browser, cropArgs);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let session = null;
    try {
      session = captureCropAndOcr(browser, crop, "ocr_wc");
      const line = findTextLine(session.ocr.lines, text);
      if (line) {
        const clickX = session.crop.x + line.centerX;
        const clickY = session.crop.y + line.centerY;
        const screenPoint = clickImagePoint(browser, clickX, clickY);
        return {
          ok: true,
          found: true,
          browser,
          targetText: text,
          line,
          screenX: Number(screenPoint.screenX.toFixed(2)),
          screenY: Number(screenPoint.screenY.toFixed(2)),
        };
      }
    } catch {
      // keep polling
    } finally {
      if (session) cleanupFiles(session.screenshotPath, session.cropPath);
    }
    sleepMs(pollMs);
  }
  return null;
}

// Wait for any of multiple texts in one screenshot per poll cycle
export function waitForAnyText(browser, texts, timeoutMs, pollMs, cropArgs = []) {
  const crop = resolveCrop(browser, cropArgs);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let session = null;
    try {
      session = captureCropAndOcr(browser, crop, "ocr_any");
      for (const text of texts) {
        const line = findTextLine(session.ocr.lines, text);
        if (line) return { found: true, matchedText: text, line, lines: session.ocr.lines };
      }
    } catch {
      // keep polling
    } finally {
      if (session) cleanupFiles(session.screenshotPath, session.cropPath);
    }
    sleepMs(pollMs);
  }
  return null;
}

export function waitForTextToDisappear(browser, text, timeoutMs, pollMs, cropArgs = []) {
  const crop = resolveCrop(browser, cropArgs);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const result = findTextInBrowser(browser, text, crop);
      if (!result.found) return { ok: true, disappeared: true };
    } catch {
      return { ok: true, disappeared: true };
    }
    sleepMs(pollMs);
  }
  return null;
}

// Combined find + click for return button (one screenshot instead of two)
export function findAndClickReturn(browser) {
  const crop = resolveCrop(browser, CROPS.returnRegion);
  let session = null;
  try {
    session = captureCropAndOcr(browser, crop, "ocr_ret");
    const line = findTextLine(session.ocr.lines, "返回");
    if (!line) return { ok: false, found: false };
    const clickX = session.crop.x + line.centerX;
    const clickY = session.crop.y + line.centerY;
    const screenPoint = clickImagePoint(browser, clickX, clickY);
    return {
      ok: true,
      found: true,
      browser,
      line,
      screenX: Number(screenPoint.screenX.toFixed(2)),
      screenY: Number(screenPoint.screenY.toFixed(2)),
    };
  } catch {
    return { ok: false, found: false };
  } finally {
    if (session) cleanupFiles(session.screenshotPath, session.cropPath);
  }
}

export function clickReturn(browser) {
  return clickText(browser, "返回", CROPS.returnRegion);
}

export function findReturn(browser) {
  return findText(browser, "返回", CROPS.returnRegion);
}
