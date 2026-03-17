import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadPng, matchTemplate, parseArgs } from "./template_match.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = parseArgs(process.argv);
if (!args.template) {
  console.error(
    "usage: node tools/image/click_template.mjs --template /tmp/template.png [--app chrome|chrome-left|chrome-right|left|right|edge|edge-left] [--threshold 0.92] [--step 1] [--sample 3] [--dry-run]",
  );
  process.exit(2);
}

const browser =
  args.app === "chrome-right" || args.app === "right" ? "chrome-right"
    : args.app === "chrome-left" || args.app === "left" ? "chrome-left"
      : args.app === "edge-left" ? "edge-left"
      : args.app === "edge" ? "edge"
        : "chrome-left";

function getBounds() {
  if (browser === "edge" || browser === "edge-left") {
    const boundsRaw = execFileSync("osascript", [
      "-e",
      'tell application "Microsoft Edge" to get bounds of front window',
    ], { encoding: "utf8" }).trim();
    const [left, top, right, bottom] = boundsRaw.split(/,\s*/).map((value) => Number.parseInt(value, 10));
    if (browser === "edge-left") {
      const screenBounds = execFileSync("osascript", [
        "-e",
        'tell application "Finder" to get bounds of window of desktop',
      ], { encoding: "utf8" }).trim();
      const [sleft, stop, sright, sbottom] = screenBounds.split(/,\s*/).map((value) => Number.parseInt(value, 10));
      const width = Math.trunc((sright - sleft) / 2);
      return { left: sleft, top: stop, right: sleft + width, bottom: sbottom, width, height: sbottom - stop };
    }
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }
  const screenBounds = execFileSync("osascript", [
    "-e",
    'tell application "Finder" to get bounds of window of desktop',
  ], { encoding: "utf8" }).trim();
  const [sleft, stop, sright, sbottom] = screenBounds.split(/,\s*/).map((value) => Number.parseInt(value, 10));
  const screenWidth = sright - sleft;
  const width = Math.trunc(screenWidth / 2);
  const left = browser === "chrome-right" ? sright - width : sleft;
  const top = stop;
  const right = left + width;
  const bottom = sbottom;
  return { left, top, right, bottom, width, height: bottom - top };
}

const { left, top, right, bottom, width: windowWidth, height: windowHeight } = getBounds();
const screenshotPath = `/tmp/${browser}_template_search.png`;
execFileSync(path.join(__dirname, "..", "system", "capture_browser_window.sh"), [browser, screenshotPath], {
  encoding: "utf8",
});

const image = loadPng(screenshotPath);
const template = loadPng(args.template);
const result = matchTemplate(image, template, args);

const clickOffsetX = Number.parseFloat(args["click-offset-x"] ?? "0");
const clickOffsetY = Number.parseFloat(args["click-offset-y"] ?? "0");
const clickCenterX = result.centerX + clickOffsetX;
const clickCenterY = result.centerY + clickOffsetY;

const scaleX = image.width / windowWidth;
const scaleY = image.height / windowHeight;
const screenX = left + clickCenterX / scaleX;
const screenY = top + clickCenterY / scaleY;

const output = {
  ...result,
  screenshotPath,
  windowBounds: { left, top, right, bottom, width: windowWidth, height: windowHeight },
  scaleX: Number(scaleX.toFixed(4)),
  scaleY: Number(scaleY.toFixed(4)),
  clickCenterX: Number(clickCenterX.toFixed(2)),
  clickCenterY: Number(clickCenterY.toFixed(2)),
  screenX: Number(screenX.toFixed(2)),
  screenY: Number(screenY.toFixed(2)),
};

if (!result.matched) {
  console.log(JSON.stringify(output));
  process.exit(1);
}

if (!args["dry-run"]) {
  if (!fs.existsSync("/tmp/chrome_click")) {
    throw new Error("/tmp/chrome_click not found; compile tools/native/chrome_click.swift first");
  }
  execFileSync("/tmp/chrome_click", [
    Math.round(screenX).toString(),
    Math.round(screenY).toString(),
  ]);
}

console.log(JSON.stringify(output));
