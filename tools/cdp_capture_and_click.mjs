import fs from "fs/promises";

const [, , action = "capture", arg1, arg2] = process.argv;

const list = await fetch("http://127.0.0.1:9222/json/list").then((r) => r.json());
const page = list.find(
  (item) => item.type === "page" && item.url === "https://www.wanyiwan.top/game/xjskp2060170000353846",
);

if (!page) {
  throw new Error("page target not found");
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

ws.onmessage = async (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

await send("Page.enable");
await send("Runtime.enable");
await send("Page.bringToFront");

if (action === "capture") {
  const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await fs.writeFile("/tmp/chrome_cdp_capture.png", Buffer.from(data, "base64"));
  console.log("/tmp/chrome_cdp_capture.png");
} else if (action === "click") {
  const x = Number(arg1);
  const y = Number(arg2);
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    button: "none",
    buttons: 0,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  console.log(`clicked ${x},${y}`);
} else if (action === "touch") {
  const x = Number(arg1);
  const y = Number(arg2);
  await send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, radiusX: 1, radiusY: 1 }],
  });
  await send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  console.log(`touched ${x},${y}`);
} else if (action === "eval") {
  const expression = arg1;
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  console.log(JSON.stringify(result.result.value ?? null));
} else {
  throw new Error(`unknown action: ${action}`);
}

ws.close();
