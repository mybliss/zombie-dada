import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function runAction(name, dryRun = false) {
  const args = [path.join(repoRoot, "tools", "game_actions.mjs"), name];
  if (dryRun) args.push("--dry-run");
  const out = execFileSync("node", args, { cwd: repoRoot, encoding: "utf8" });
  return JSON.parse(out);
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const flow = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!flow || !["open_invite", "to_friends", "invite_first", "invite_all"].includes(flow)) {
  console.error("usage: node tools/game_flow.mjs <open_invite|to_friends|invite_first|invite_all> [--dry-run]");
  process.exit(2);
}

const steps = {
  open_invite: ["bottom_invite"],
  to_friends: ["bottom_invite", "friends_tab"],
  invite_first: ["bottom_invite", "friends_tab", "invite_button"],
  invite_all: ["bottom_invite", "friends_tab", "one_click_invite"],
};

const results = [];
for (const step of steps[flow]) {
  results.push({ step, result: runAction(step, dryRun) });
  if (!dryRun) sleepMs(300);
}

console.log(JSON.stringify({ flow, dryRun, results }, null, 2));
