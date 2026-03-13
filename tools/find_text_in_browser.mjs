import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const browser = process.argv[2];
const targetText = process.argv[3];
const argMap = new Map();
for (let i = 4; i < process.argv.length; i += 2) {
  if (process.argv[i]?.startsWith("--")) {
    argMap.set(process.argv[i], process.argv[i + 1]);
  }
}

if (!["chrome", "chrome-left", "chrome-right", "left", "right", "edge", "edge-left"].includes(browser) || !targetText) {
  console.error("usage: node tools/find_text_in_browser.mjs <chrome|chrome-left|chrome-right|left|right|edge|edge-left> <text>");
  process.exit(2);
}

const browserKey =
  browser === "chrome-right" || browser === "right" ? "chrome-right"
    : browser === "chrome-left" || browser === "left" ? "chrome-left"
      : browser === "edge-left" ? "edge-left"
      : browser;
const suffix = `${process.pid}_${Date.now()}`;
const screenshotPath = `/tmp/${browserKey}_ocr_find_${suffix}.png`;
const cropPath = `/tmp/${browserKey}_ocr_find_crop_${suffix}.png`;
const ocrBin = "/tmp/ocr_text";
const cropByBrowser = {
  chrome: { x: 250, y: 1450, w: 900, h: 500 },
  "chrome-left": { x: 250, y: 1450, w: 900, h: 500 },
  "chrome-right": { x: 250, y: 1450, w: 900, h: 500 },
  edge: { x: 200, y: 1450, w: 1000, h: 550 },
  "edge-left": { x: 200, y: 1450, w: 1000, h: 550 },
};

function sh(cmd, args = []) {
  return execFileSync(cmd, args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function retryOcr(imagePath, attempts = 4) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return JSON.parse(sh(ocrBin, [imagePath]));
    } catch (error) {
      lastError = error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80);
    }
  }
  throw lastError;
}

function waitForImage(pathname, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const stat = fs.statSync(pathname);
      if (stat.size > 0) {
        return;
      }
    } catch {
      // keep waiting until the file is visible and non-empty
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80);
  }
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

ensureOcrTool();
sh(path.join(repoRoot, "tools", "capture_browser_window.sh"), [browserKey, screenshotPath]);
const defaultCropKey =
  browserKey === "chrome-left" || browserKey === "chrome-right" ? "chrome-left"
    : browserKey === "edge-left" ? "edge-left"
      : browserKey;
const defaultCrop = cropByBrowser[defaultCropKey];
const crop = {
  x: Number.parseInt(argMap.get("--x") || String(defaultCrop.x), 10),
  y: Number.parseInt(argMap.get("--y") || String(defaultCrop.y), 10),
  w: Number.parseInt(argMap.get("--w") || String(defaultCrop.w), 10),
  h: Number.parseInt(argMap.get("--h") || String(defaultCrop.h), 10),
};
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

const ocr = retryOcr(cropPath);
const line = ocr.lines.find((item) => normalizeText(item.text).includes(normalizeText(targetText))) || null;

console.log(JSON.stringify({
  ok: Boolean(line),
  found: Boolean(line),
  browser,
  targetText,
  screenshotPath,
  cropPath,
  line,
  lines: ocr.lines,
}, null, 2));
