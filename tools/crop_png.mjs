import fs from "fs";
import { PNG } from "pngjs";

function parseArgs(argv) {
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

const args = parseArgs(process.argv);
if (!args.image || !args.out || !args.x || !args.y || !args.w || !args.h) {
  console.error(
    "usage: node tools/crop_png.mjs --image in.png --x 10 --y 10 --w 100 --h 50 --out template.png",
  );
  process.exit(2);
}

const src = PNG.sync.read(fs.readFileSync(args.image));
const srcX = Number.parseInt(args.x, 10);
const srcY = Number.parseInt(args.y, 10);
const srcW = Number.parseInt(args.w, 10);
const srcH = Number.parseInt(args.h, 10);

const x = Math.max(0, Math.min(src.width, srcX));
const y = Math.max(0, Math.min(src.height, srcY));
const w = Math.max(1, Math.min(srcW, src.width - x));
const h = Math.max(1, Math.min(srcH, src.height - y));

const out = new PNG({ width: w, height: h });
PNG.bitblt(src, out, x, y, w, h, 0, 0);
fs.writeFileSync(args.out, PNG.sync.write(out));

console.log(args.out);
