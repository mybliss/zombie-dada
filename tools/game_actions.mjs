import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const clickTemplate = path.join(repoRoot, "tools", "click_template.mjs");
const templates = path.join(repoRoot, "assets", "game_templates");

const actions = {
  bottom_invite: {
    app: "chrome",
    template: path.join(templates, "a1_plus_invite.png"),
    region: ["--region-x", "780", "--region-y", "1500", "--region-w", "520", "--region-h", "260"],
    threshold: "0.74",
    sample: "2",
  },
  friends_tab: {
    app: "chrome",
    template: path.join(templates, "a2_grey_friends.png"),
    region: ["--region-x", "380", "--region-y", "1680", "--region-w", "520", "--region-h", "260"],
    threshold: "0.84",
    sample: "2",
  },
  invite_button: {
    app: "chrome",
    template: path.join(templates, "a3_online_friend.png"),
    region: ["--region-x", "260", "--region-y", "360", "--region-w", "1260", "--region-h", "1160"],
    threshold: "0.84",
    sample: "3",
  },
  start_game: {
    app: "chrome",
    template: path.join(templates, "a4_start_game.png"),
    region: ["--region-x", "300", "--region-y", "1400", "--region-w", "1200", "--region-h", "500"],
    threshold: "0.75",
    sample: "2",
  },
  one_click_invite: {
    app: "chrome",
    template: path.join(templates, "one_click_invite.png"),
    region: ["--region-x", "520", "--region-y", "1500", "--region-w", "680", "--region-h", "360"],
    threshold: "0.81",
    sample: "2",
  },
  accept_invite: {
    app: "edge",
    template: path.join(templates, "b1_fuben_invite.png"),
    region: ["--region-x", "760", "--region-y", "1040", "--region-w", "520", "--region-h", "560"],
    threshold: "0.75",
    sample: "2",
  },
  accept_confirm: {
    app: "edge",
    template: path.join(templates, "b2_accept_reject.png"),
    region: ["--region-x", "450", "--region-y", "650", "--region-w", "1300", "--region-h", "1100"],
    threshold: "0.74",
    sample: "2",
    clickOffset: { x: 0, y: -49 },
  },
};

const action = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!action || !actions[action]) {
  console.error(`usage: node tools/game_actions.mjs <${Object.keys(actions).join("|")}> [--dry-run]`);
  process.exit(2);
}

const cfg = actions[action];
const args = [
  clickTemplate,
  "--app",
  cfg.app,
  "--template",
  cfg.template,
  "--threshold",
  cfg.threshold,
  "--step",
  "1",
  "--sample",
  cfg.sample,
  ...cfg.region,
];
if (dryRun) args.push("--dry-run");

if (cfg.clickOffset) {
  args.push("--click-offset-x", String(cfg.clickOffset.x));
  args.push("--click-offset-y", String(cfg.clickOffset.y));
}

const output = execFileSync("node", args, {
  cwd: repoRoot,
  encoding: "utf8",
});

process.stdout.write(output);
