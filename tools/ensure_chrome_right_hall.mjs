import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const ocrBin = "/tmp/ocr_text";
const screenshotPath = "/tmp/chrome_right_hall_check.png";

function sh(cmd, args = []) {
  return execFileSync(cmd, args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function ensureOcrTool() {
  if (fs.existsSync(ocrBin)) return;
  execFileSync("xcrun", [
    "--sdk", "macosx", "swiftc",
    path.join(repoRoot, "tools", "ocr_text.swift"),
    "-framework", "Vision",
    "-framework", "AppKit",
    "-o", ocrBin,
  ], { cwd: repoRoot, encoding: "utf8" });
}

function normalizeText(value) {
  return value.replace(/\s+/g, "").replace(/[()（）]/g, "").toLowerCase();
}

function clickScreenPoint(screenX, screenY) {
  execFileSync("/tmp/chrome_click", [String(Math.round(screenX)), String(Math.round(screenY))], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function getBounds() {
  const raw = sh("osascript", ["-e", 'tell application "Finder" to get bounds of window of desktop']);
  const [sleft, stop, sright, sbottom] = raw.split(/,\s*/).map((value) => Number.parseInt(value, 10));
  const width = Math.trunc((sright - sleft) / 2);
  return { left: sright - width, top: stop, right: sright, bottom: sbottom, width, height: sbottom - stop };
}

ensureOcrTool();
sh(path.join(repoRoot, "tools", "capture_browser_window.sh"), ["chrome-right", screenshotPath]);
const ocr = JSON.parse(sh(ocrBin, [screenshotPath]));

const hasInvite = ocr.lines.some((line) => normalizeText(line.text).includes(normalizeText("邀请")));
if (hasInvite) {
  console.log(JSON.stringify({ ok: true, state: "hall" }, null, 2));
  process.exit(0);
}

const returnLine = ocr.lines.find((line) => normalizeText(line.text).includes(normalizeText("返回")));
if (returnLine) {
  const bounds = getBounds();
  const imageWidth = bounds.width * 2;
  const imageHeight = bounds.height * 2;
  const screenX = bounds.left + returnLine.centerX / (imageWidth / bounds.width);
  const screenY = bounds.top + returnLine.centerY / (imageHeight / bounds.height);
  clickScreenPoint(screenX, screenY);
  sleepMs(500);
  sh(path.join(repoRoot, "tools", "capture_browser_window.sh"), ["chrome-right", screenshotPath]);
  const retryOcr = JSON.parse(sh(ocrBin, [screenshotPath]));
  const hallNow = retryOcr.lines.some((line) => normalizeText(line.text).includes(normalizeText("邀请")));
  if (hallNow) {
    console.log(JSON.stringify({ ok: true, state: "hall_after_return" }, null, 2));
    process.exit(0);
  }
}

console.error(JSON.stringify({ ok: false, reason: "chrome_right_hall_not_ready" }, null, 2));
process.exit(1);
