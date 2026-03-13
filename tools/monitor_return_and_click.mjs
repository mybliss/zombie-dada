import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const ocrBin = "/tmp/ocr_text";

const browser = process.argv[2] || "edge-left";
const timeoutMs = Number.parseInt(process.argv[3] || "600000", 10);
const pollMs = Number.parseInt(process.argv[4] || "5000", 10);
const initialDelayMs = Number.parseInt(process.argv[5] || "300000", 10);

if (!["edge-left", "chrome-right", "chrome-left", "edge", "chrome"].includes(browser)) {
  console.error("usage: node tools/monitor_return_and_click.mjs <edge-left|chrome-right|chrome-left|edge|chrome> [timeout_ms] [poll_ms] [initial_delay_ms]");
  process.exit(2);
}

const suffix = `${process.pid}_${Date.now()}`;
const screenshotPath = `/tmp/${browser}_return_watch_${suffix}.png`;
const cropPath = `/tmp/${browser}_return_watch_crop_${suffix}.png`;
const cropByBrowser = {
  "edge-left": { x: 0, y: 1500, w: 700, h: 500 },
  edge: { x: 0, y: 1500, w: 700, h: 500 },
  "chrome-right": { x: 0, y: 1500, w: 700, h: 500 },
  "chrome-left": { x: 0, y: 1500, w: 700, h: 500 },
  chrome: { x: 0, y: 1500, w: 700, h: 500 },
};
const crop = cropByBrowser[browser];

function sh(cmd, args = []) {
  return execFileSync(cmd, args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitForImage(pathname, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const stat = fs.statSync(pathname);
      if (stat.size > 0) return;
    } catch {
      // keep waiting
    }
    sleepMs(80);
  }
}

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

function normalizeText(value) {
  return value.replace(/\s+/g, "").replace(/[()（）]/g, "").toLowerCase();
}

function getBounds() {
  const raw = sh("osascript", ["-e", 'tell application "Finder" to get bounds of window of desktop']);
  const [sleft, stop, sright, sbottom] = raw.split(/,\s*/).map((value) => Number.parseInt(value, 10));
  const width = Math.trunc((sright - sleft) / 2);
  if (browser === "chrome-right") {
    return { left: sleft + width, top: stop, right: sright, bottom: sbottom, width, height: sbottom - stop };
  }
  return { left: sleft, top: stop, right: sleft + width, bottom: sbottom, width, height: sbottom - stop };
}

function clickScreenPoint(screenX, screenY) {
  execFileSync("/tmp/chrome_click", [String(Math.round(screenX)), String(Math.round(screenY))], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

ensureOcrTool();
sleepMs(initialDelayMs);
const start = Date.now();

while (Date.now() - start < timeoutMs) {
  sh(path.join(repoRoot, "tools", "capture_browser_window.sh"), [browser, screenshotPath]);
  sh("node", [
    path.join(repoRoot, "tools", "crop_png.mjs"),
    "--image", screenshotPath,
    "--x", String(crop.x),
    "--y", String(crop.y),
    "--w", String(crop.w),
    "--h", String(crop.h),
    "--out", cropPath,
  ]);
  waitForImage(cropPath);

  const ocr = JSON.parse(sh(ocrBin, [cropPath]));
  const line = ocr.lines.find((item) => normalizeText(item.text).includes(normalizeText("返回")));
  if (line) {
    const bounds = getBounds();
    const imageWidth = bounds.width * 2;
    const imageHeight = bounds.height * 2;
    const clickCenterX = crop.x + line.centerX;
    const clickCenterY = crop.y + line.centerY;
    const screenX = bounds.left + clickCenterX / (imageWidth / bounds.width);
    const screenY = bounds.top + clickCenterY / (imageHeight / bounds.height);
    clickScreenPoint(screenX, screenY);
    console.log(JSON.stringify({
      ok: true,
      browser,
      found: true,
      line,
      screenX: Number(screenX.toFixed(2)),
      screenY: Number(screenY.toFixed(2)),
    }, null, 2));
    process.exit(0);
  }

  sleepMs(pollMs);
}

console.error(JSON.stringify({ ok: false, reason: "return_not_found", timeoutMs }, null, 2));
process.exit(1);
