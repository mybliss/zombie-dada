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

export const RESULT_MARKER = "__CODEX_RESULT__";

export function formatMarkedResult(payload) {
  return `${RESULT_MARKER}${JSON.stringify(payload)}`;
}

export function parseMarkedResult(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line.startsWith(RESULT_MARKER)) {
      return JSON.parse(line.slice(RESULT_MARKER.length));
    }
  }
  throw new Error("missing_marked_result");
}
