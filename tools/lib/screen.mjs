import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { WINDOW_ROLE_BROWSERS } from "./config.mjs";
import { repoRoot, runCommand } from "./runtime.mjs";

let _displayScale = null;

export function getDisplayScale() {
  if (_displayScale !== null) return _displayScale;
  const testPath = `/tmp/_scale_detect_${process.pid}.png`;
  try {
    execFileSync("screencapture", ["-x", "-R0,0,2,2", testPath], { encoding: "utf8" });
    const raw = execFileSync("sips", ["-g", "pixelWidth", testPath], { encoding: "utf8" });
    const match = raw.match(/pixelWidth:\s*(\d+)/);
    _displayScale = match ? Number.parseInt(match[1], 10) / 2 : 2;
  } catch {
    _displayScale = 2;
  }
  try { fs.unlinkSync(testPath); } catch {}
  return _displayScale;
}

let _desktopBounds = null;

function getDesktopBounds() {
  if (_desktopBounds !== null) return _desktopBounds;
  const raw = runCommand("osascript", ["-e", 'tell application "Finder" to get bounds of window of desktop']);
  const [sleft, stop, sright, sbottom] = raw.split(/,\s*/).map((value) => Number.parseInt(value, 10));
  _desktopBounds = { left: sleft, top: stop, right: sright, bottom: sbottom };
  return _desktopBounds;
}

let _referenceSize = null;
const REF_PATH = path.join(repoRoot, ".screen-reference.json");

function getReferenceSize() {
  if (_referenceSize !== null) return _referenceSize;
  try {
    _referenceSize = JSON.parse(fs.readFileSync(REF_PATH, "utf8"));
    return _referenceSize;
  } catch {
    // First run: current screen becomes the reference
    const bounds = getWindowBounds("edge-left");
    const scale = getDisplayScale();
    _referenceSize = {
      width: Math.round(bounds.width * scale),
      height: Math.round(bounds.height * scale),
    };
    try {
      fs.writeFileSync(REF_PATH, JSON.stringify(_referenceSize, null, 2) + "\n");
    } catch {}
    return _referenceSize;
  }
}

let _screenshotScale = null;

export function getScreenshotScale(browser) {
  if (_screenshotScale !== null) return _screenshotScale;
  const ref = getReferenceSize();
  const bounds = getWindowBounds(browser);
  const scale = getDisplayScale();
  const actualW = Math.round(bounds.width * scale);
  const actualH = Math.round(bounds.height * scale);
  _screenshotScale = {
    sx: actualW / ref.width,
    sy: actualH / ref.height,
  };
  return _screenshotScale;
}

export function scaleCrop(crop, browser) {
  const { sx, sy } = getScreenshotScale(browser);
  if (sx === 1 && sy === 1) return crop;
  return {
    x: Math.round(crop.x * sx),
    y: Math.round(crop.y * sy),
    w: Math.round(crop.w * sx),
    h: Math.round(crop.h * sy),
  };
}

export function scaleImagePoint(x, y, browser) {
  const { sx, sy } = getScreenshotScale(browser);
  return { x: Math.round(x * sx), y: Math.round(y * sy) };
}

export function clickScreenPoint(screenX, screenY) {
  execFileSync("/tmp/chrome_click", [String(Math.round(screenX)), String(Math.round(screenY))], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

export function getWindowBounds(browser) {
  const { left: sleft, top: stop, right: sright, bottom: sbottom } = getDesktopBounds();
  const width = Math.trunc((sright - sleft) / 2);

  if (browser === "edge-left") {
    return { left: sleft, top: stop, right: sleft + width, bottom: sbottom, width, height: sbottom - stop };
  }

  if (browser === "chrome-right") {
    return { left: sright - width, top: stop, right: sright, bottom: sbottom, width, height: sbottom - stop };
  }

  const appName = WINDOW_ROLE_BROWSERS[browser];
  if (!appName) {
    throw new Error(`unsupported browser: ${browser}`);
  }
  const appBounds = runCommand("osascript", ["-e", `tell application "${appName}" to get bounds of front window`]);
  const [left, top, right, bottom] = appBounds.split(/,\s*/).map((value) => Number.parseInt(value, 10));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function imagePointToScreen(browser, centerX, centerY) {
  const bounds = getWindowBounds(browser);
  const scale = getDisplayScale();
  const screenX = bounds.left + centerX / scale;
  const screenY = bounds.top + centerY / scale;
  return {
    bounds,
    screenX,
    screenY,
  };
}

export function clickImagePoint(browser, centerX, centerY) {
  const { screenX, screenY } = imagePointToScreen(browser, centerX, centerY);
  clickScreenPoint(screenX, screenY);
  return { screenX, screenY };
}
