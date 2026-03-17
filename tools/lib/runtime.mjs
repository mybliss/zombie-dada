import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const toolsDir = path.resolve(__dirname, "..");
export const repoRoot = path.resolve(toolsDir, "..");

export function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function now() {
  return Date.now();
}

export function runCommand(command, args = [], options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  }).trim();
}

export function runNodeTool(scriptName, args = [], options = {}) {
  return runCommand("node", [path.join(toolsDir, scriptName), ...args], options);
}

export function runTool(scriptName, args = [], options = {}) {
  return runCommand(path.join(toolsDir, scriptName), args, options);
}

export function normalizeText(value) {
  return value.replace(/\s+/g, "").replace(/[()（）]/g, "").toLowerCase();
}

export function parseJson(value) {
  return JSON.parse(value);
}

export function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
