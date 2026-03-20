import express from "express";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { WebSocketServer } from "ws";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 3777;

app.use(express.json());
app.use(express.static(join(__dirname, "public")));

const runningProcesses = new Map();

function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

function logToClient(type, message, data = {}) {
  broadcast({ type: "log", logType: type, message, data, timestamp: new Date().toISOString() });
}

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    processes: Array.from(runningProcesses.keys()),
  });
});

app.post("/api/start-windows", (req, res) => {
  const processKey = "start-windows";

  if (runningProcesses.has(processKey)) {
    return res.json({ ok: false, error: "already_running" });
  }

  logToClient("info", "启动双浏览器...");

  const proc = spawn("./start_windows.sh", [], {
    cwd: __dirname,
    shell: true,
  });

  runningProcesses.set(processKey, proc);

  proc.on("close", (code) => {
    runningProcesses.delete(processKey);
    logToClient("info", `双浏览器启动完成，退出码: ${code}`);
    broadcast({ type: "process_end", processKey });
  });

  proc.on("error", (err) => {
    runningProcesses.delete(processKey);
    logToClient("error", `启动失败: ${err.message}`);
  });

  res.json({ ok: true });
});

app.post("/api/start-single-browser", (req, res) => {
  const processKey = "start-single-browser";

  if (runningProcesses.has(processKey)) {
    return res.json({ ok: false, error: "already_running" });
  }

  logToClient("info", "启动单浏览器...");

  const proc = spawn("./start_single_browser.sh", [], {
    cwd: __dirname,
    shell: true,
  });

  runningProcesses.set(processKey, proc);

  proc.on("close", (code) => {
    runningProcesses.delete(processKey);
    logToClient("info", `浏览器启动完成，退出码: ${code}`);
    broadcast({ type: "process_end", processKey });
  });

  proc.on("error", (err) => {
    runningProcesses.delete(processKey);
    logToClient("error", `启动失败: ${err.message}`);
  });

  res.json({ ok: true });
});

app.post("/api/team-run", (req, res) => {
  const { friendName, mode, rounds } = req.body;

  if (!friendName) {
    return res.json({ ok: false, error: "friend_name_required" });
  }

  const processKey = "team-run";

  if (runningProcesses.has(processKey)) {
    return res.json({ ok: false, error: "already_running" });
  }

  const args = [friendName];
  if (mode === "loop" && rounds) {
    args.push("loop", String(rounds));
  } else {
    args.push("loop");
  }

  logToClient("info", `组队寰球启动: 好友=${friendName}, 模式=${mode}, 轮数=${rounds || "无限"}`);

  const proc = spawn("node", ["./run.mjs", ...args], {
    cwd: __dirname,
    shell: false,
  });

  runningProcesses.set(processKey, proc);

  proc.stdout.on("data", (data) => {
    const text = data.toString().trim();
    if (text) {
      logToClient("stdout", text);
    }
  });

  proc.stderr.on("data", (data) => {
    const text = data.toString().trim();
    if (text) {
      logToClient("stderr", text);
    }
  });

  proc.on("close", (code) => {
    runningProcesses.delete(processKey);
    logToClient("info", `组队寰球结束，退出码: ${code}`);
    broadcast({ type: "process_end", processKey });
  });

  proc.on("error", (err) => {
    runningProcesses.delete(processKey);
    logToClient("error", `执行失败: ${err.message}`);
  });

  res.json({ ok: true });
});

app.post("/api/rescue-run", (req, res) => {
  const { browser, runMode, rounds } = req.body;

  const processKey = "rescue-run";

  if (runningProcesses.has(processKey)) {
    return res.json({ ok: false, error: "already_running" });
  }

  const args = [browser || "edge"];
  if (runMode === "rounds" && rounds) {
    args.push(runMode);
    args.push(String(rounds));
  } else {
    args.push("loop");
    args.push("999999");
  }

  logToClient("info", `寰球救援启动: 浏览器=${browser}, 轮数=${runMode === "rounds" ? rounds : "无限"}`);

  const proc = spawn("node", ["./tools/flows/rescue_join.mjs", ...args], {
    cwd: __dirname,
    shell: false,
  });

  runningProcesses.set(processKey, proc);

  proc.stdout.on("data", (data) => {
    const text = data.toString().trim();
    if (text) {
      logToClient("stdout", text);
    }
  });

  proc.stderr.on("data", (data) => {
    const text = data.toString().trim();
    if (text) {
      logToClient("stderr", text);
    }
  });

  proc.on("close", (code) => {
    runningProcesses.delete(processKey);
    logToClient("info", `寰球救援结束，退出码: ${code}`);
    broadcast({ type: "process_end", processKey });
  });

  proc.on("error", (err) => {
    runningProcesses.delete(processKey);
    logToClient("error", `执行失败: ${err.message}`);
  });

  res.json({ ok: true });
});

app.post("/api/stop", (req, res) => {
  const { processKey } = req.body;

  if (!processKey) {
    for (const [key, proc] of runningProcesses) {
      proc.kill();
      runningProcesses.delete(key);
      logToClient("info", `已停止: ${key}`);
    }
    return res.json({ ok: true });
  }

  const proc = runningProcesses.get(processKey);
  if (proc) {
    proc.kill();
    runningProcesses.delete(processKey);
    logToClient("info", `已停止: ${processKey}`);
    res.json({ ok: true });
  } else {
    res.json({ ok: false, error: "not_found" });
  }
});

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "connected", message: "已连接到服务器" }));
});

server.listen(PORT, () => {
  console.log(`GUI 服务已启动: http://localhost:${PORT}`);
});
