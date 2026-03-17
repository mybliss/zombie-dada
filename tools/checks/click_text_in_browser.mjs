import { clickTextInBrowser, parseCropArgs } from "../lib/ocr_session.mjs";

const browser = process.argv[2];
const targetText = process.argv[3];
const dryRun = process.argv.includes("--dry-run");
const argMap = new Map();
for (let i = 4; i < process.argv.length; i += 2) {
  if (process.argv[i]?.startsWith("--")) {
    argMap.set(process.argv[i], process.argv[i + 1]);
  }
}

if (!["chrome", "chrome-left", "chrome-right", "left", "right", "edge", "edge-left"].includes(browser) || !targetText) {
  console.error("usage: node tools/checks/click_text_in_browser.mjs <chrome|chrome-left|chrome-right|left|right|edge|edge-left> <text> [--dry-run]");
  process.exit(2);
}

const { crop } = parseCropArgs(browser, argMap);

try {
  console.log(JSON.stringify(clickTextInBrowser(browser, targetText, crop, dryRun), null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
