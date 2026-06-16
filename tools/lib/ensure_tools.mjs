import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { repoRoot } from "./runtime.mjs";

// macOS clears /tmp on reboot, so the prebuilt OCR/click binaries copied there
// by setup.sh disappear and the whole flow crashes on first capture. Ensure
// they exist on every launch: prefer the bundled prebuilt binary, fall back to
// compiling the Swift source.
const TMP_DIR = "/tmp";
const BIN_DIR = path.join(repoRoot, "bin", "macos-arm64");
const NATIVE_DIR = path.join(repoRoot, "tools", "native");

const TOOLS = [
  { name: "ocr_text", source: "ocr_text.swift", frameworks: ["Vision", "AppKit"] },
  { name: "chrome_click", source: "chrome_click.swift", frameworks: ["AppKit"] },
];

function installPrebuilt(tool, dest) {
  const prebuilt = path.join(BIN_DIR, tool.name);
  if (!fs.existsSync(prebuilt)) return false;
  fs.copyFileSync(prebuilt, dest);
  fs.chmodSync(dest, 0o755);
  return true;
}

function compileFromSource(tool, dest) {
  const src = path.join(NATIVE_DIR, tool.source);
  const args = [src];
  for (const fw of tool.frameworks) args.push("-framework", fw);
  args.push("-o", dest);
  execFileSync("xcrun", ["swiftc", ...args], { cwd: repoRoot, encoding: "utf8" });
}

/**
 * Make sure /tmp/ocr_text and /tmp/chrome_click exist and are executable.
 * Returns a summary array; throws only if a tool can be neither copied nor
 * compiled.
 */
export function ensureNativeTools({ log = false } = {}) {
  const summary = [];
  for (const tool of TOOLS) {
    const dest = path.join(TMP_DIR, tool.name);
    let okExisting = false;
    try {
      okExisting = fs.statSync(dest).size > 0;
    } catch { /* missing */ }
    if (okExisting) {
      summary.push({ tool: tool.name, action: "present" });
      continue;
    }
    if (installPrebuilt(tool, dest)) {
      summary.push({ tool: tool.name, action: "copied_prebuilt" });
    } else {
      compileFromSource(tool, dest);
      summary.push({ tool: tool.name, action: "compiled" });
    }
    if (log) {
      process.stderr.write(`[ensure-tools] ${tool.name}: ${summary[summary.length - 1].action}\n`);
    }
  }
  return summary;
}
