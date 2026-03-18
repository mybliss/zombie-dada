import fs from "fs";
import { normalizeText, runCommand, runNodeTool, runTool, sleepMs } from "./runtime.mjs";
import { clickImagePoint, imagePointToScreen, scaleCrop } from "./screen.mjs";

const OCR_BIN = "/tmp/ocr_text";
const keepDebugImages = process.env.KEEP_DEBUG_IMAGES === "1";

function browserKeyOf(browser) {
  return browser === "chrome-right" || browser === "right" ? "chrome-right"
    : browser === "chrome-left" || browser === "left" ? "chrome-left"
      : browser === "edge-left" ? "edge-left"
        : browser;
}

function defaultCropFor(browserKey) {
  if (browserKey === "chrome" || browserKey === "chrome-left" || browserKey === "chrome-right") {
    return { x: 250, y: 1450, w: 900, h: 500 };
  }
  return { x: 200, y: 1450, w: 1000, h: 550 };
}

function waitForImage(pathname, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const stat = fs.statSync(pathname);
      if (stat.size > 0) return;
    } catch {
      // keep waiting until visible
    }
    sleepMs(80);
  }
}

function retryOcr(imagePath, attempts = 4) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return JSON.parse(runCommand(OCR_BIN, [imagePath]));
    } catch (error) {
      lastError = error;
      sleepMs(80);
    }
  }
  throw lastError;
}

function cleanupTempFiles(...paths) {
  if (keepDebugImages) return;
  for (const pathname of paths) {
    if (!pathname) continue;
    try {
      fs.unlinkSync(pathname);
    } catch {
      // ignore cleanup failures for temp files
    }
  }
}

export function parseCropArgs(browser, argMap) {
  const browserKey = browserKeyOf(browser);
  const fallback = defaultCropFor(browserKey);
  return {
    browserKey,
    crop: {
      x: Number.parseInt(argMap.get("--x") || String(fallback.x), 10),
      y: Number.parseInt(argMap.get("--y") || String(fallback.y), 10),
      w: Number.parseInt(argMap.get("--w") || String(fallback.w), 10),
      h: Number.parseInt(argMap.get("--h") || String(fallback.h), 10),
    },
  };
}

export function captureCropAndOcr(browser, crop, suffixPrefix) {
  const browserKey = browserKeyOf(browser);
  const scaled = scaleCrop(crop, browserKey);
  const suffix = `${process.pid}_${Date.now()}`;
  const screenshotPath = `/tmp/${browserKey}_${suffixPrefix}_${suffix}.png`;
  const cropPath = `/tmp/${browserKey}_${suffixPrefix}_crop_${suffix}.png`;

  runTool("system/capture_browser_window.sh", [browserKey, screenshotPath]);
  runNodeTool("image/crop_png.mjs", [
    "--image", screenshotPath,
    "--x", String(scaled.x),
    "--y", String(scaled.y),
    "--w", String(scaled.w),
    "--h", String(scaled.h),
    "--out", cropPath,
  ]);
  waitForImage(cropPath);
  const ocr = retryOcr(cropPath);

  return {
    browserKey,
    screenshotPath,
    cropPath,
    crop: scaled,
    ocr,
  };
}

export function findTextLine(lines, targetText) {
  return lines.find((item) => normalizeText(item.text).includes(normalizeText(targetText))) || null;
}

export function findTextInBrowser(browser, targetText, crop) {
  const session = captureCropAndOcr(browser, crop, "ocr_find");
  try {
    const line = findTextLine(session.ocr.lines, targetText);
    return {
      ok: Boolean(line),
      found: Boolean(line),
      browser,
      targetText,
      screenshotPath: keepDebugImages ? session.screenshotPath : null,
      cropPath: keepDebugImages ? session.cropPath : null,
      line,
      lines: session.ocr.lines,
    };
  } finally {
    cleanupTempFiles(session.screenshotPath, session.cropPath);
  }
}

export function clickTextInBrowser(browser, targetText, crop, dryRun = false) {
  const session = captureCropAndOcr(browser, crop, "ocr_click");
  try {
    const line = findTextLine(session.ocr.lines, targetText);
    if (!line) {
      throw new Error(JSON.stringify({
        ok: false,
        reason: "text_not_found",
        browser,
        targetText,
        lines: session.ocr.lines,
      }, null, 2));
    }

    const clickCenterX = session.crop.x + line.centerX;
    const clickCenterY = session.crop.y + line.centerY;
    const browserKey = browserKeyOf(browser);
    const screenPoint = dryRun
      ? imagePointToScreen(browserKey, clickCenterX, clickCenterY)
      : clickImagePoint(browserKey, clickCenterX, clickCenterY);

    return {
      ok: true,
      browser,
      targetText,
      dryRun,
      screenshotPath: keepDebugImages ? session.screenshotPath : null,
      cropPath: keepDebugImages ? session.cropPath : null,
      line,
      screenX: Number(screenPoint.screenX.toFixed(2)),
      screenY: Number(screenPoint.screenY.toFixed(2)),
    };
  } finally {
    cleanupTempFiles(session.screenshotPath, session.cropPath);
  }
}
