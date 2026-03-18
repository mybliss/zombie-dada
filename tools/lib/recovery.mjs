import fs from "fs";
import { runCommand, runTool, normalizeText, sleepMs } from "./runtime.mjs";
import { clickImagePoint, scaleImagePoint } from "./screen.mjs";

const OCR_BIN = "/tmp/ocr_text";
const keepDebugImages = process.env.KEEP_DEBUG_IMAGES === "1";

export function captureOcr(browser, screenshotPath) {
  runTool("system/capture_browser_window.sh", [browser, screenshotPath]);
  const result = JSON.parse(runCommand(OCR_BIN, [screenshotPath]));
  if (!keepDebugImages) {
    try { fs.unlinkSync(screenshotPath); } catch {}
  }
  return result;
}

export function hasAnyText(lines, texts) {
  return texts.some((target) =>
    lines.some((line) => normalizeText(line.text).includes(normalizeText(target))));
}

export function findLineByText(lines, targetText) {
  return lines.find((line) => normalizeText(line.text).includes(normalizeText(targetText))) || null;
}

export function clickLine(browser, line) {
  return clickImagePoint(browser, line.centerX, line.centerY);
}

export function clickFixedPoint(browser, point) {
  const scaled = scaleImagePoint(point.x, point.y, browser);
  return clickImagePoint(browser, scaled.x, scaled.y);
}

export function ensureRecoveryState(spec) {
  for (let i = 0; i < spec.maxAttempts; i += 1) {
    const ocr = captureOcr(spec.browser, spec.screenshotPath);
    if (hasAnyText(ocr.lines, spec.readyTexts)) {
      return { ok: true, state: "ready" };
    }

    let acted = false;
    for (const action of spec.actions) {
      if (action.type === "text") {
        const line = findLineByText(ocr.lines, action.text);
        if (line) {
          clickLine(spec.browser, line);
          acted = true;
        }
      } else if (action.type === "popupClose") {
        const marker = findLineByText(ocr.lines, action.markerText);
        if (marker) {
          clickFixedPoint(spec.browser, action.point);
          acted = true;
        }
      }

      if (acted) {
        sleepMs(spec.settleMs);
        break;
      }
    }

    if (!acted) {
      break;
    }
  }

  throw new Error(JSON.stringify({ ok: false, reason: spec.failureReason }, null, 2));
}
