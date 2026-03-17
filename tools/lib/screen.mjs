import { execFileSync } from "child_process";
import { IMAGE_SCALE, WINDOW_ROLE_BROWSERS } from "./config.mjs";
import { repoRoot, runCommand } from "./runtime.mjs";

export function clickScreenPoint(screenX, screenY) {
  execFileSync("/tmp/chrome_click", [String(Math.round(screenX)), String(Math.round(screenY))], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

export function getWindowBounds(browser) {
  const raw = runCommand("osascript", ["-e", 'tell application "Finder" to get bounds of window of desktop']);
  const [sleft, stop, sright, sbottom] = raw.split(/,\s*/).map((value) => Number.parseInt(value, 10));
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
  const screenX = bounds.left + centerX / IMAGE_SCALE;
  const screenY = bounds.top + centerY / IMAGE_SCALE;
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
