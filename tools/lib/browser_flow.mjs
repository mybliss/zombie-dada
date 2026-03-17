import { CROPS, RECOVERY } from "./config.mjs";
import { ensureRecoveryState } from "./recovery.mjs";
import { parseJson, runNodeTool, runTool, sleepMs } from "./runtime.mjs";

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
  return parseJson(runNodeTool("checks/find_text_in_browser.mjs", [browser, text, ...cropArgs]));
}

export function clickText(browser, text, cropArgs = []) {
  return parseJson(runNodeTool("checks/click_text_in_browser.mjs", [browser, text, ...cropArgs]));
}

export function waitForText(browser, text, timeoutMs, pollMs, cropArgs = []) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const result = findText(browser, text, cropArgs);
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

export function waitForTextToDisappear(browser, text, timeoutMs, pollMs, cropArgs = []) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const result = findText(browser, text, cropArgs);
      if (!result.found) {
        return { ok: true, disappeared: true };
      }
    } catch {
      return { ok: true, disappeared: true };
    }
    sleepMs(pollMs);
  }
  return null;
}

export function clickReturn(browser) {
  return clickText(browser, "返回", CROPS.returnRegion);
}

export function findReturn(browser) {
  return findText(browser, "返回", CROPS.returnRegion);
}
