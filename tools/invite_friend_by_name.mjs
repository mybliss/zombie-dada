import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { BROWSERS, CROPS, INVITE_FLOW, TIMINGS } from "./lib/config.mjs";
import { normalizeText, runCommand, runNodeTool, runTool, sleepMs } from "./lib/runtime.mjs";
import { clickImagePoint, getWindowBounds } from "./lib/screen.mjs";
import { loadPng, matchTemplate } from "./template_match.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const templatesDir = path.join(repoRoot, "assets", "game_templates");
const targetName = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!targetName) {
  console.error("usage: node tools/invite_friend_by_name.mjs <friend_name> [--dry-run]");
  process.exit(2);
}

const screenshotPath = "/tmp/invite_friend_by_name.png";
const cropPath = "/tmp/invite_friend_by_name_crop.png";
const ocrBin = "/tmp/ocr_text";
const a3TemplatePath = path.join(templatesDir, "a3_online_friend.png");

function ensureOcrTool() {
  if (fs.existsSync(ocrBin)) return;
  execFileSync("xcrun", [
    "--sdk",
    "macosx",
    "swiftc",
    path.join(repoRoot, "tools", "ocr_text.swift"),
    "-framework",
    "Vision",
    "-framework",
    "AppKit",
    "-o",
    ocrBin,
  ], { cwd: repoRoot, encoding: "utf8" });
}
function normalizeFriendText(value) {
  return normalizeText(value).replace(/服/g, "");
}

function clickScreenPoint(screenX, screenY) {
  if (!fs.existsSync("/tmp/chrome_click")) {
    throw new Error("/tmp/chrome_click not found; compile tools/chrome_click.swift first");
  }
  execFileSync("/tmp/chrome_click", [
    Math.round(screenX).toString(),
    Math.round(screenY).toString(),
  ], { cwd: repoRoot, encoding: "utf8" });
}

function getChromeBounds() {
  return getWindowBounds(BROWSERS.accountA);
}

function captureChrome() {
  runTool("focus_game_window.sh", [BROWSERS.accountA]);
  sleepMs(TIMINGS.focusSettleMs);
  runTool("capture_browser_window.sh", [BROWSERS.accountA, screenshotPath]);
  return loadPng(screenshotPath);
}

function runOcr(imagePath) {
  ensureOcrTool();
  return JSON.parse(runCommand(ocrBin, [imagePath]));
}

const listRegion = CROPS.inviteListRegion;
const popupTabsRegion = CROPS.invitePopupTabsRegion;
const hallBottomRegion = CROPS.hallBottomInviteRegion;

function cropListRegion() {
  runNodeTool("crop_png.mjs", [
    "--image",
    screenshotPath,
    "--x",
    String(listRegion.x),
    "--y",
    String(listRegion.y),
    "--w",
    String(listRegion.w),
    "--h",
    String(listRegion.h),
    "--out",
    cropPath,
  ]);
}

function cropPopupTabsRegion() {
  runNodeTool("crop_png.mjs", [
    "--image",
    screenshotPath,
    "--x",
    String(popupTabsRegion.x),
    "--y",
    String(popupTabsRegion.y),
    "--w",
    String(popupTabsRegion.w),
    "--h",
    String(popupTabsRegion.h),
    "--out",
    cropPath,
  ]);
}

function cropHallBottomRegion() {
  runNodeTool("crop_png.mjs", [
    "--image",
    screenshotPath,
    "--x",
    String(hallBottomRegion.x),
    "--y",
    String(hallBottomRegion.y),
    "--w",
    String(hallBottomRegion.w),
    "--h",
    String(hallBottomRegion.h),
    "--out",
    cropPath,
  ]);
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

function tryMatch(image, templatePath, options) {
  return matchTemplate(image, loadPng(templatePath), options);
}

function popupInviteButtonsMatch(image) {
  return tryMatch(image, a3TemplatePath, INVITE_FLOW.popupMatch);
}

function findHallInviteText() {
  cropHallBottomRegion();
  const ocr = runOcr(cropPath);
  const inviteLine =
    ocr.lines.find((line) => normalizeText(line.text) === normalizeText("邀请")) ||
    ocr.lines.find((line) => normalizeText(line.text).includes(normalizeText("邀请")));
  return { ocr, inviteLine };
}

function listHasTargetName(image, target) {
  cropListRegion();
  const ocr = runOcr(cropPath);
  const bestLine = findBestTextLine(ocr.lines, target);
  return { ocr, bestLine };
}

function hasInvitePopup() {
  cropListRegion();
  const ocr = runOcr(cropPath);
  const hasTitle = ocr.lines.some((line) => normalizeText(line.text).includes(normalizeText("组队邀请")));
  const hasButton = ocr.lines.some((line) => normalizeText(line.text) === normalizeText("邀请"));
  return hasTitle || hasButton;
}

function findPopupTab(name) {
  cropPopupTabsRegion();
  const ocr = runOcr(cropPath);
  const normalizedTarget = normalizeText(name);
  return ocr.lines.find((line) => normalizeText(line.text).includes(normalizedTarget));
}

function clickFromCrop(bounds, image, crop, point) {
  const clickCenterX = crop.x + point.centerX;
  const clickCenterY = crop.y + point.centerY;
  const scaleX = image.width / bounds.width;
  const scaleY = image.height / bounds.height;
  const screenX = bounds.left + clickCenterX / scaleX;
  const screenY = bounds.top + clickCenterY / scaleY;
  if (!dryRun) clickScreenPoint(screenX, screenY);
  return { screenX, screenY };
}

function clickFriendsTab(bounds, image) {
  const popupFriendsTab = findPopupTab("好友");
  if (popupFriendsTab) {
    return clickFromCrop(bounds, image, popupTabsRegion, popupFriendsTab);
  }
  return clickFromMatch(bounds, image, INVITE_FLOW.popupFriendsFallbackPoint);
}

function ensureFriendsList() {
  let image = captureChrome();
  const currentList = listHasTargetName(image, targetName);
  if (currentList.bestLine) {
    return { image, ocr: currentList.ocr, bestLine: currentList.bestLine };
  }

  const popupMatch = popupInviteButtonsMatch(image);
  if (popupMatch.matched) {
    const bounds = getChromeBounds();
    for (let i = 0; i < INVITE_FLOW.popupFriendsRetryCount; i += 1) {
      clickFriendsTab(bounds, image);
      sleepMs(TIMINGS.inviteFriendsTabSettleMs);
      image = captureChrome();
      const afterClick = listHasTargetName(image, targetName);
      if (afterClick.bestLine) {
        return { image, ocr: afterClick.ocr, bestLine: afterClick.bestLine };
      }
    }
    const afterClick = listHasTargetName(image, targetName);
    return { image, ocr: afterClick.ocr, bestLine: afterClick.bestLine };
  }

  const hallInvite = findHallInviteText();
  if (hallInvite.inviteLine) {
    const bounds = getChromeBounds();
    const candidates = INVITE_FLOW.hallInviteCandidates.map(({ deltaX, deltaY }) => ({
      ...hallInvite.inviteLine,
      centerX: hallInvite.inviteLine.centerX + deltaX,
      centerY: hallInvite.inviteLine.centerY + deltaY,
    }));
    for (const candidate of candidates) {
      clickFromCrop(bounds, image, hallBottomRegion, candidate);
      sleepMs(TIMINGS.invitePopupOpenSettleMs);
      image = captureChrome();
      if (popupInviteButtonsMatch(image).matched) break;
    }

    if (popupInviteButtonsMatch(image).matched || hasInvitePopup()) {
      for (let i = 0; i < INVITE_FLOW.popupFriendsRetryCount; i += 1) {
        clickFriendsTab(bounds, image);
        sleepMs(TIMINGS.invitePopupOpenSettleMs);
        image = captureChrome();
        const afterClick = listHasTargetName(image, targetName);
        if (afterClick.bestLine) {
          return { image, ocr: afterClick.ocr, bestLine: afterClick.bestLine };
        }
      }
    }
  }

  const finalList = listHasTargetName(image, targetName);
  return { image, ocr: finalList.ocr, bestLine: finalList.bestLine };
}

function clickFromMatch(bounds, image, match) {
  const scaleX = image.width / bounds.width;
  const scaleY = image.height / bounds.height;
  const screenX = bounds.left + match.centerX / scaleX;
  const screenY = bounds.top + match.centerY / scaleY;
  if (!dryRun) clickScreenPoint(screenX, screenY);
  return { screenX, screenY };
}

function matchInviteButtonNearY(image, centerY) {
  const template = loadPng(a3TemplatePath);
  const minY = Math.max(0, Math.round(centerY - INVITE_FLOW.nearbyInviteButton.deltaY));
  const maxY = Math.min(image.height - template.height, Math.round(centerY + INVITE_FLOW.nearbyInviteButton.deltaY));
  return matchTemplate(image, template, {
    threshold: INVITE_FLOW.nearbyInviteButton.threshold,
    step: INVITE_FLOW.nearbyInviteButton.step,
    sample: INVITE_FLOW.nearbyInviteButton.sample,
    "region-x": String(INVITE_FLOW.nearbyInviteButton.regionX),
    "region-y": String(minY),
    "region-w": String(INVITE_FLOW.nearbyInviteButton.regionW),
    "region-h": String(Math.max(template.height + 20, maxY - minY + template.height)),
  });
}

const ensureResult = ensureFriendsList();
const image = ensureResult.image;
const ocr = ensureResult.ocr ?? runOcr(cropPath);
const bestLine = ensureResult.bestLine ?? findBestTextLine(ocr.lines, targetName);

if (!bestLine) {
  console.error(JSON.stringify({
    ok: false,
    reason: "friend_name_not_found",
    targetName,
    ocrLines: ocr.lines.slice(0, 20),
  }, null, 2));
  process.exit(1);
}

const fullCenterY = listRegion.y + bestLine.centerY;
const match = matchInviteButtonNearY(image, fullCenterY);

if (!match.matched) {
  console.error(JSON.stringify({
    ok: false,
    reason: "invite_button_not_found_near_friend",
    targetName,
    bestLine,
    match,
  }, null, 2));
  process.exit(1);
}

const bounds = getChromeBounds();
const { screenX, screenY } = clickFromMatch(bounds, image, match);

console.log(JSON.stringify({
  ok: true,
  targetName,
  dryRun,
  screenshotPath,
  cropPath,
  bestLine,
  inviteButtonMatch: match,
  screenX: Number(screenX.toFixed(2)),
  screenY: Number(screenY.toFixed(2)),
}, null, 2));
