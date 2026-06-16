import { BROWSERS, TIMINGS } from "../lib/config.mjs";
import { normalizeText, runTool, sleepMs } from "../lib/runtime.mjs";
import { clickScreenPoint, getDisplayScale, getWindowBounds } from "../lib/screen.mjs";
import {
  captureWindowOcr,
  inviteMatcher,
  textMatcher,
  waitForCondition,
  waitForOcrSettle,
  waitForStableTextAndClick,
} from "../lib/robust_ocr.mjs";

const targetName = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const browser = BROWSERS.accountA;

if (!targetName) {
  console.error("usage: node tools/flows/invite_friend_by_name.mjs <friend_name> [--dry-run]");
  process.exit(2);
}

function fail(reason, extra = {}) {
  console.error(JSON.stringify({ ok: false, reason, targetName, ...extra }, null, 2));
  process.exit(1);
}

function normalizeFriendText(value) {
  return normalizeText(value).replace(/服/g, "");
}

// --- one-time focus, then no-focus captures (avoid perturbing the canvas) ----
runTool("system/focus_game_window.sh", [browser]);
sleepMs(TIMINGS.focusSettleMs);

// Region guards in normalized image coords (0..1). The popup tabs live at the
// very bottom; the hall invite button is bottom-right; friend rows are mid-body.
const REGION = {
  hallInvite: { xMin: 0.55, xMax: 0.99, yMin: 0.78, yMax: 0.97 },
  popupTabs: { xMin: 0.1, xMax: 0.9, yMin: 0.9, yMax: 1.0 },
  friendRows: { xMin: 0.1, xMax: 0.95, yMin: 0.25, yMax: 0.82 },
};

// Does the friend appear anywhere right now? (used as a verify condition)
function friendVisible(frame) {
  const nt = normalizeFriendText(targetName);
  return frame.lines.some((l) => {
    const nl = normalizeFriendText(l.text);
    return nl && (nl.includes(nt) || nt.includes(nl));
  });
}

function popupTabsVisible(frame) {
  const norm = (t) => normalizeText(t);
  const hasRec = frame.lines.some((l) => norm(l.text) === "推荐");
  const hasFri = frame.lines.some((l) => norm(l.text) === "好友");
  return hasRec && hasFri;
}

// --- Step 1: open the team-invite popup -------------------------------------
function openInvitePopup() {
  const target = {
    name: "hall_invite",
    match: inviteMatcher,
    region: REGION.hallInvite,
    minConfidence: 0.15,
    requiredHits: 2,
    maxClusterDistancePx: 90,
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const click = waitForStableTextAndClick(browser, target, { timeoutMs: 5000, pollMs: 220, dryRun });
    if (!click.clicked) {
      sleepMs(500);
      continue;
    }
    if (dryRun) return true;
    sleepMs(TIMINGS.invitePopupOpenSettleMs);
    // Verify the popup opened: tabs appear, OR the friend is already listed.
    const verified = waitForCondition(browser, { anyText: ["推荐", "好友", "组队邀请"] }, { timeoutMs: 2500 });
    if (verified.ok) return true;
  }
  return false;
}

// --- Step 2: switch to the 好友 (friends) tab and reveal the friend ---------
function switchToFriendsTab() {
  // If friend already visible, nothing to do.
  let frame = captureWindowOcr(browser, "fr");
  if (friendVisible(frame)) return true;
  if (!popupTabsVisible(frame)) return friendVisible(frame);

  const friendsTab = {
    name: "friends_tab",
    match: textMatcher(["好友"]),
    region: REGION.popupTabs,
    minConfidence: 0.3,
    requiredHits: 2,
    maxClusterDistancePx: 80,
  };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const click = waitForStableTextAndClick(browser, friendsTab, { timeoutMs: 3000, pollMs: 200, dryRun });
    if (!click.clicked) {
      sleepMs(400);
      continue;
    }
    if (dryRun) return true;
    waitForOcrSettle(browser, { region: REGION.friendRows, minStableFrames: 2, timeoutMs: 2000 });
    frame = captureWindowOcr(browser, "fr");
    if (friendVisible(frame)) return true;
  }
  frame = captureWindowOcr(browser, "fr");
  return friendVisible(frame);
}

// --- Run Step 1: open popup unless the list/popup is already up -------------
{
  const frame = captureWindowOcr(browser, "probe");
  if (!(friendVisible(frame) || popupTabsVisible(frame))) {
    if (!openInvitePopup()) {
      fail("invite_popup_not_opened", { ocrLines: captureWindowOcr(browser, "dbg").lines.slice(0, 20) });
    }
  }
}

if (!switchToFriendsTab()) {
  fail("friend_name_not_found", { ocrLines: captureWindowOcr(browser, "dbg").lines.slice(0, 20) });
}

// --- Step 3: find the friend row, then the invite button on that row --------
// Multi-frame consensus on the friend name location, then a row-band invite.
function findFriendRowAndInvite() {
  const nt = normalizeFriendText(targetName);
  const rowYs = [];
  let inviteObs = [];
  let dims = { w: 0, h: 0 };

  for (let i = 0; i < 5; i += 1) {
    const frame = captureWindowOcr(browser, "row");
    dims = { w: frame.width, h: frame.height };
    // Friend name cluster
    const friend = frame.lines
      .map((l) => ({ l, nl: normalizeFriendText(l.text) }))
      .filter(({ nl }) => nl && (nl.includes(nt) || nt.includes(nl)))
      .sort((a, b) => (b.l.confidence ?? 0) - (a.l.confidence ?? 0))[0];
    if (friend) rowYs.push(friend.l.centerY);
    // Invite candidates (right side of body, not tabs/hall)
    for (const l of frame.lines) {
      if (inviteMatcher(l) <= 0) continue;
      const ny = frame.height ? l.centerY / frame.height : 0;
      if (ny < 0.25 || ny > 0.82) continue; // body rows only
      inviteObs.push({ x: l.centerX, y: l.centerY, text: l.text });
    }
    sleepMs(180);
  }

  if (rowYs.length === 0) return null;
  const rowY = rowYs.sort((a, b) => a - b)[Math.floor(rowYs.length / 2)];

  // Pick invite candidates within the friend's row band, to the right of name.
  const rowInvites = inviteObs.filter((o) => Math.abs(o.y - rowY) < 70);
  if (rowInvites.length === 0) return null;
  // Cluster the row invites and take the densest.
  const buckets = [];
  for (const o of rowInvites) {
    let b = buckets.find((bk) => Math.abs(bk.x - o.x) < 80 && Math.abs(bk.y - o.y) < 50);
    if (!b) { b = { x: o.x, y: o.y, items: [] }; buckets.push(b); }
    b.items.push(o);
    b.x = b.items.reduce((s, it) => s + it.x, 0) / b.items.length;
    b.y = b.items.reduce((s, it) => s + it.y, 0) / b.items.length;
  }
  buckets.sort((a, b) => b.items.length - a.items.length);
  const best = buckets[0];
  return { x: best.x, y: best.y, rowY };
}

const invitePoint = findFriendRowAndInvite();
if (!invitePoint) {
  fail("invite_button_not_found_near_friend", {
    ocrLines: captureWindowOcr(browser, "dbg").lines.slice(0, 20),
  });
}

const bounds = getWindowBounds(browser);
const scale = getDisplayScale();
const screenX = bounds.left + invitePoint.x / scale;
const screenY = bounds.top + invitePoint.y / scale;
if (!dryRun) clickScreenPoint(screenX, screenY);

console.log(JSON.stringify({
  ok: true,
  targetName,
  dryRun,
  invitePoint: { x: Math.round(invitePoint.x), y: Math.round(invitePoint.y) },
  screenX: Number(screenX.toFixed(2)),
  screenY: Number(screenY.toFixed(2)),
}, null, 2));
