import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const flowsDir = path.join(__dirname, "tools", "flows");

const friendName = process.argv[2];
const mode = process.argv[3] || "once";
const extraArgs = process.argv.slice(4);

if (!friendName) {
  console.error("usage: node ./run.mjs <friend_name> [once|loop] [extra_args...]");
  process.exit(2);
}

const scriptName = mode === "loop" ? "repeat_send_accept_start.mjs" : "send_and_accept.mjs";

const result = spawnSync("node", [path.join(flowsDir, scriptName), friendName, ...extraArgs], {
  cwd: __dirname,
  encoding: "utf8",
  stdio: "pipe",
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.status !== 0) {
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.status ?? 1);
}
