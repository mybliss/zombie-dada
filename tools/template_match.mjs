import fs from "fs";
import { PNG } from "pngjs";

export function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

export function loadPng(path) {
  return PNG.sync.read(fs.readFileSync(path));
}

export function toGray(png) {
  const gray = new Float32Array(png.width * png.height);
  for (let i = 0, j = 0; i < png.data.length; i += 4, j += 1) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const a = png.data[i + 3] / 255;
    gray[j] = (0.299 * r + 0.587 * g + 0.114 * b) * a;
  }
  return gray;
}

function parseIntArg(value, fallback) {
  if (value == null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function matchTemplate(image, template, options = {}) {
  const imageGray = toGray(image);
  const templateGray = toGray(template);
  const threshold = Number.parseFloat(options.threshold ?? "0.92");
  const searchStep = parseIntArg(options.step, 1);
  const sampleStep = parseIntArg(options.sample, 3);
  const regionX = parseIntArg(options["region-x"], 0);
  const regionY = parseIntArg(options["region-y"], 0);
  const regionW = parseIntArg(options["region-w"], image.width - regionX);
  const regionH = parseIntArg(options["region-h"], image.height - regionY);

  if (template.width > image.width || template.height > image.height) {
    throw new Error("template is larger than image");
  }

  const minX = Math.max(0, regionX);
  const minY = Math.max(0, regionY);
  const maxX = Math.min(image.width - template.width, regionX + regionW - template.width);
  const maxY = Math.min(image.height - template.height, regionY + regionH - template.height);

  let best = { score: -Infinity, x: 0, y: 0 };
  let sampleCount = 0;
  for (let ty = 0; ty < template.height; ty += sampleStep) {
    for (let tx = 0; tx < template.width; tx += sampleStep) {
      const alpha = template.data[(ty * template.width + tx) * 4 + 3];
      if (alpha > 0) sampleCount += 1;
    }
  }

  for (let y = minY; y <= maxY; y += searchStep) {
    for (let x = minX; x <= maxX; x += searchStep) {
      let diffSum = 0;
      let seen = 0;
      let abort = false;
      for (let ty = 0; ty < template.height && !abort; ty += sampleStep) {
        const imageRow = (y + ty) * image.width;
        const templateRow = ty * template.width;
        for (let tx = 0; tx < template.width; tx += sampleStep) {
          const a = template.data[(templateRow + tx) * 4 + 3];
          if (a === 0) continue;
          const imageValue = imageGray[imageRow + x + tx];
          const templateValue = templateGray[templateRow + tx];
          diffSum += Math.abs(imageValue - templateValue);
          seen += 1;
          const maxAllowed = (1 - Math.max(best.score, threshold - 0.08)) * 255 * seen;
          if (seen > 12 && diffSum > maxAllowed) {
            abort = true;
            break;
          }
        }
      }
      if (!seen) continue;
      const normalized = 1 - diffSum / (255 * seen);
      if (normalized > best.score) {
        best = { score: normalized, x, y };
      }
    }
  }

  return {
    x: best.x,
    y: best.y,
    width: template.width,
    height: template.height,
    centerX: best.x + template.width / 2,
    centerY: best.y + template.height / 2,
    score: Number(best.score.toFixed(5)),
    matched: best.score >= threshold,
    sampleCount,
  };
}

const args = parseArgs(process.argv);
if (process.argv[1] && process.argv[1].endsWith("template_match.mjs")) {
  if (!args.image || !args.template) {
    console.error(
      "usage: node tools/template_match.mjs --image screenshot.png --template button.png [--threshold 0.92] [--step 2] [--sample 3]",
    );
    process.exit(2);
  }

  const image = loadPng(args.image);
  const template = loadPng(args.template);
  const result = matchTemplate(image, template, args);
  console.log(JSON.stringify(result));
}
