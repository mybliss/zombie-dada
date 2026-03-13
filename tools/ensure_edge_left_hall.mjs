import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const ocrBin = "/tmp/ocr_text";
const screenshotPath = "/tmp/edge_left_hall_check.png";

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
  return { left: sleft, top: stop, right: sleft + width, bottom: sbottom, width, height: sbottom - stop };
}

function captureAndRead() {
  sh(path.join(repoRoot, "tools", "capture_browser_window.sh"), ["edge-left", screenshotPath]);
  return JSON.parse(sh(ocrBin, [screenshotPath]));
}

function hasHall(ocr) {
  return ocr.lines.some((line) => {
    const text = normalizeText(line.text);
    return text.includes(normalizeText("开始游戏")) || text.includes(normalizeText("邀请"));
  });
}

function clickLine(line) {
  const bounds = getBounds();
  const imageWidth = bounds.width * 2;
  const imageHeight = bounds.height * 2;
  const screenX = bounds.left + line.centerX / (imageWidth / bounds.width);
  const screenY = bounds.top + line.centerY / (imageHeight / bounds.height);
  clickScreenPoint(screenX, screenY);
}

ensureOcrTool();

for (let i = 0; i < 4; i += 1) {
  const ocr = captureAndRead();
  if (hasHall(ocr)) {
    console.log(JSON.stringify({ ok: true, state: "hall" }, null, 2));
    process.exit(0);
  }

  const returnLine = ocr.lines.find((line) => normalizeText(line.text).includes(normalizeText("返回")));
  if (returnLine) {
    clickLine(returnLine);
    sleepMs(800);
    continue;
  }

  const leaveLine = ocr.lines.find((line) => normalizeText(line.text).includes(normalizeText("离开")));
  if (leaveLine) {
    clickLine(leaveLine);
    sleepMs(800);
    continue;
  }

  const confirmLine = ocr.lines.find((line) => normalizeText(line.text).includes(normalizeText("确定")));
  if (confirmLine) {
    clickLine(confirmLine);
    sleepMs(800);
    continue;
  }

  const closeCandidate = ocr.lines.find((line) => normalizeText(line.text).includes(normalizeText("组队邀请")));
  if (closeCandidate) {
    const bounds = getBounds();
    const imageWidth = bounds.width * 2;
    const imageHeight = bounds.height * 2;
    const screenX = bounds.left + 920 / (imageWidth / bounds.width);
    const screenY = bounds.top + 480 / (imageHeight / bounds.height);
    clickScreenPoint(screenX, screenY);
    sleepMs(800);
    continue;
  }

  break;
}

console.error(JSON.stringify({ ok: false, reason: "edge_left_hall_not_ready" }, null, 2));
process.exit(1);
