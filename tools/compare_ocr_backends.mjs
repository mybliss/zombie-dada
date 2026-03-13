import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const imagePath = process.argv[2];
const targetText = process.argv[3] || "";

if (!imagePath) {
  console.error("usage: node tools/compare_ocr_backends.mjs <image.png> [target_text]");
  process.exit(2);
}

function normalizeText(value) {
  return value.replace(/\s+/g, "").replace(/[()（）]/g, "").toLowerCase();
}

function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function matchLine(lines, target) {
  if (!target) return null;
  return lines.find((line) => normalizeText(line.text).includes(normalizeText(target))) || null;
}

const visionBin = "/tmp/ocr_text";
const vision = JSON.parse(run(visionBin, [imagePath]));
const paddle = JSON.parse(run(path.join(repoRoot, ".venv-paddle", "bin", "python"), [
  path.join(repoRoot, "tools", "ocr_text_paddle.py"),
  imagePath,
]));

console.log(JSON.stringify({
  imagePath,
  targetText,
  vision: {
    matched: Boolean(matchLine(vision.lines, targetText)),
    line: matchLine(vision.lines, targetText),
    lineCount: vision.lines.length,
  },
  paddle: {
    matched: Boolean(matchLine(paddle.lines, targetText)),
    line: matchLine(paddle.lines, targetText),
    lineCount: paddle.lines.length,
  },
}, null, 2));
