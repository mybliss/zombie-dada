import { RESCUE_CONFIG, RESCUE_STATE, getCropForSize } from "../lib/rescue_config.mjs";
import { captureCropAndOcr, findTextLine } from "../lib/ocr_session.mjs";
import { clickImagePoint, clickImagePointWithOffset, getCropOffset, getDisplayScale, clickScreenPoint } from "../lib/screen.mjs";
import { runTool, sleepMs, now, formatMarkedResult } from "../lib/runtime.mjs";
import { focusWindow } from "../lib/browser_flow.mjs";
import { loadPng, matchTemplate } from "../image/template_match.mjs";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const templatesDir = path.join(repoRoot, "assets", "game_templates");

const browser = process.argv[2] || "edge";
const runMode = process.argv[3] || "loop";
const maxRounds = Number.parseInt(process.argv[4] || "999999", 10);

const C = RESCUE_CONFIG;

let screenSize = null;
let debugMode = false;
let debugRound = 0;
let debugScreenshotSaved = false;
let currentStep = 0;

function log(message, data = {}) {
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  const dataStr = Object.keys(data).length > 0 ? ` | ${Object.entries(data).map(([k, v]) => `${k}=${v}`).join(", ")}` : "";
  console.log(`[${time}] 步骤${currentStep} | ${message}${dataStr}`);
}

function step(num, message, data = {}) {
  currentStep = num;
  log(message, data);
}

function getBrowserKey() {
  return browser === "chrome" ? "chrome-right" : "edge-left";
}

function clickScreenCenter() {
  const { width, height } = getScreenSize();
  const centerX = width / 2;
  const centerY = height / 2;
  clickImagePoint(getBrowserKey(), centerX, centerY);
}

function getScreenSize() {
  if (screenSize) return screenSize;
  const tempPath = `/tmp/_screen_size_${process.pid}.png`;
  try {
    runTool("system/capture_game_window.sh", [getBrowserKey(), tempPath]);
    const png = loadPng(tempPath);
    screenSize = { width: png.width, height: png.height };
    return screenSize;
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {}
  }
}

function getCrop(cropKey) {
  const { width, height } = getScreenSize();
  return getCropForSize(cropKey, width, height);
}

function captureAndOcr(cropKey) {
  const crop = getCrop(cropKey);
  const session = captureCropAndOcr(getBrowserKey(), crop, `rescue_${cropKey}`, true);
  
  if (debugMode && debugRound === 1 && !debugScreenshotSaved) {
    const debugDir = path.join(repoRoot, "debug_screenshots");
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    const timestamp = Date.now();
    const screenshotDebug = path.join(debugDir, `round1_fullscreen_${timestamp}.png`);
    fs.copyFileSync(session.screenshotPath, screenshotDebug);
    log("调试截图已保存", { 
      screenshot: screenshotDebug,
      screenSize: { width: screenSize?.width, height: screenSize?.height },
      cropRegion: crop 
    });
    debugScreenshotSaved = true;
  }
  
  return session;
}

function hasText(lines, texts) {
  const normalized = texts.map((t) => t.toLowerCase().replace(/\s+/g, ""));
  return lines.some((line) => {
    const lineText = line.text.toLowerCase().replace(/\s+/g, "");
    return normalized.some((t) => lineText.includes(t));
  });
}

function findStageLine(lines, targetStage) {
  const normalized = targetStage.toLowerCase().replace(/\s+/g, "");
  return lines.find((line) => {
    const lineText = line.text.toLowerCase().replace(/\s+/g, "");
    return lineText.includes(normalized);
  });
}

function clickAtLine(cropKey, line) {
  const crop = getCrop(cropKey);
  const clickX = crop.x + line.centerX;
  const clickY = crop.y + line.centerY;
  
  const screenshotPath = `/tmp/rescue_click_${Date.now()}.png`;
  const cropInfoPath = `${screenshotPath}.json`;
  
  try {
    runTool("system/capture_game_window.sh", [getBrowserKey(), screenshotPath]);
    const { offsetX, offsetY } = getCropOffset(cropInfoPath);
    const scale = getDisplayScale();
    
    const screenX = (clickX + offsetX) / scale;
    const screenY = (clickY + offsetY) / scale;
    
    clickScreenPoint(screenX, screenY);
    log("点击坐标", { clickX: Math.round(clickX), clickY: Math.round(clickY), screenX: Math.round(screenX), screenY: Math.round(screenY), scale });
  } finally {
    try {
      if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
      if (fs.existsSync(cropInfoPath)) fs.unlinkSync(cropInfoPath);
    } catch {}
  }
}

function clickTemplate(templateName, cropKey, threshold = 0.7) {
  const templatePath = path.join(templatesDir, templateName);
  if (!fs.existsSync(templatePath)) {
    log(`模板文件不存在: ${templateName}`);
    return false;
  }

  const crop = getCrop(cropKey);
  const screenshotPath = `/tmp/rescue_template_${Date.now()}.png`;
  const cropInfoPath = `${screenshotPath}.json`;
  const croppedPath = `/tmp/rescue_cropped_${Date.now()}.png`;

  try {
    runTool("system/capture_game_window.sh", [getBrowserKey(), screenshotPath]);

    if (debugMode && debugRound === 1) {
      const debugDir = path.join(repoRoot, "debug_screenshots");
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      const debugPath = path.join(debugDir, `template_${templateName}_${Date.now()}.png`);
      fs.copyFileSync(screenshotPath, debugPath);
      log("调试截图已保存", { file: debugPath });
    }

    const result = matchTemplate(screenshotPath, templatePath, {
      threshold: String(threshold),
    });

    if (result.matched) {
      log("找到图标", { template: templateName, score: (result.score || 0).toFixed(2), scale: result.scale || 1 });
      const clickResult = clickImagePointWithOffset(getBrowserKey(), result.centerX, result.centerY, cropInfoPath);
      log("点击位置", { x: Math.round(clickResult.screenX), y: Math.round(clickResult.screenY) });
      return true;
    } else {
      log("未找到图标", { template: templateName, score: (result.score || 0).toFixed(2), threshold });
      return false;
    }
  } catch (err) {
    log(`模板匹配失败: ${err.message}`);
    return false;
  } finally {
    try {
      if (fs.existsSync(screenshotPath)) {
        fs.unlinkSync(screenshotPath);
      }
      if (fs.existsSync(cropInfoPath)) {
        fs.unlinkSync(cropInfoPath);
      }
      if (fs.existsSync(croppedPath)) {
        fs.unlinkSync(croppedPath);
      }
    } catch {}
  }
}

async function enterRecruitChannel() {
  step(1, "进入招募频道");

  focusWindow(getBrowserKey());
  sleepMs(C.timeouts.pollInterval);

  step(2, "激活网页窗口");
  clickScreenCenter();
  sleepMs(300);

  step(3, "查找聊天图标");
  const chatClicked = clickTemplate("liaotian.png", "chatEntry");
  if (!chatClicked) {
    log("错误: 未找到聊天图标，脚本停止");
    process.exit(1);
  }
  sleepMs(500);

  step(4, "查找招募图标");
  const recruitClicked = clickTemplate("zhaomu.png", "recruitTab");
  if (!recruitClicked) {
    log("错误: 未找到招募图标，脚本停止");
    process.exit(1);
  }
  step(5, "已进入招募频道");
  sleepMs(300);
  return true;
}

async function findAndJoinRescue() {
  step(6, "寻找救援请求");

  const templatePath = path.join(templatesDir, "huanqiuyaoqing.png");
  if (!fs.existsSync(templatePath)) {
    log("模板文件不存在: huanqiuyaoqing.png");
    return { found: false, reason: "no_template" };
  }

  const screenshotPath = `/tmp/rescue_find_${Date.now()}.png`;
  const cropInfoPath = `${screenshotPath}.json`;

  try {
    runTool("system/capture_game_window.sh", [getBrowserKey(), screenshotPath]);
    
    const result = matchTemplate(screenshotPath, templatePath, { threshold: "0.35" });
    
    if (!result.matched) {
      log("未找到救援请求");
      return { found: false, reason: "no_rescue" };
    }

    log("找到救援请求", { x: result.centerX, y: result.centerY, width: result.width, height: result.height });

    const cropInfoExists = fs.existsSync(cropInfoPath);
    log("cropInfo文件", { path: cropInfoPath, exists: cropInfoExists });
    
    const clickResult = clickImagePointWithOffset(getBrowserKey(), result.centerX, result.centerY, cropInfoPath);
    log("点击救援", { x: Math.round(clickResult.screenX), y: Math.round(clickResult.screenY) });
    
    while (true) {
      clickScreenPoint(clickResult.screenX, clickResult.screenY);
      
      sleepMs(5);
      
      const checkSession = captureAndOcr("battleStatus");
      const recruitLine = findTextLine(checkSession.ocr.lines, "招募频道");
      
      if (!recruitLine) {
        log("未找到招募频道，继续下一步");
        break;
      }
    }
    
    return { found: true };
  } finally {
    try {
      if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
      if (fs.existsSync(cropInfoPath)) fs.unlinkSync(cropInfoPath);
    } catch {}
  }
}

async function checkWaitingStart() {
  step(7, "检查等待开始");

  const maxWaitCount = 6;
  let waitCount = 0;
  
  while (waitCount < maxWaitCount) {
    const session = captureAndOcr("battleStatus");
    const waitLine = findTextLine(session.ocr.lines, "等待开始");
    
    if (waitLine) {
      waitCount++;
      log("等待开始", { count: waitCount, max: maxWaitCount });
      
      if (waitCount >= maxWaitCount) {
        log("等待超时，寻找离开按钮");
        const leaveLine = findTextLine(session.ocr.lines, "离开");
        if (leaveLine) {
          clickAtLine("battleStatus", leaveLine);
          log("已点击离开");
          return { success: false };
        }
        return { success: false };
      }
      
      sleepMs(10000);
    } else {
      log("未找到等待开始，检查其他状态");
      
      step(8, "检查其他状态");
      
      const mercenaryLine = findTextLine(session.ocr.lines, "佣兵列队");
      log("检查佣兵列队", { found: !!mercenaryLine });
      
      if (mercenaryLine) {
        log("找到佣兵列队，等待360秒");
        sleepMs(360000);
        return { success: true };
      }
      
      let mercenaryRetry = 0;
      const maxMercenaryRetry = 5;
      while (mercenaryRetry < maxMercenaryRetry) {
        mercenaryRetry++;
        log("未找到佣兵列队，等待10秒后重试", { retry: mercenaryRetry, max: maxMercenaryRetry });
        sleepMs(10000);
        
        const retrySession = captureAndOcr("battleStatus");
        const retryMercenaryLine = findTextLine(retrySession.ocr.lines, "佣兵列队");
        log("重试检查佣兵列队", { found: !!retryMercenaryLine });
        
        if (retryMercenaryLine) {
          log("找到佣兵列队，等待360秒");
          sleepMs(360000);
          return { success: true };
        }
      }
      
      const levelLines = session.ocr.lines.filter(line => line.text.includes("级"));
      log("检查包含'级'的文字", { lines: levelLines.map(l => l.text) });
      
      if (levelLines.length > 0) {
        log("找到关卡，等待360秒");
        sleepMs(360000);
        return { success: true };
      }
      
      let levelRetry = 0;
      const maxLevelRetry = 5;
      while (levelRetry < maxLevelRetry) {
        levelRetry++;
        log("未找到关卡，等待10秒后重试", { retry: levelRetry, max: maxLevelRetry });
        sleepMs(10000);
        
        const retrySession = captureAndOcr("battleStatus");
        const retryLevelLines = retrySession.ocr.lines.filter(line => line.text.includes("级"));
        log("重试检查包含'级'的文字", { lines: retryLevelLines.map(l => l.text) });
        
        if (retryLevelLines.length > 0) {
          log("找到关卡，等待360秒");
          sleepMs(360000);
          return { success: true };
        }
      }
      
      const skillLines = session.ocr.lines.filter(line => line.text.includes("选择技能"));
      log("检查包含'选择技能'的文字", { lines: skillLines.map(l => l.text) });
      
      if (skillLines.length > 0) {
        log("找到选择技能，等待360秒");
        sleepMs(360000);
        return { success: true };
      }
      
      let skillRetry = 0;
      const maxSkillRetry = 5;
      while (skillRetry < maxSkillRetry) {
        skillRetry++;
        log("未找到选择技能，等待10秒后重试", { retry: skillRetry, max: maxSkillRetry });
        sleepMs(10000);
        
        const retrySession = captureAndOcr("battleStatus");
        const retrySkillLines = retrySession.ocr.lines.filter(line => line.text.includes("选择技能"));
        log("重试检查包含'选择技能'的文字", { lines: retrySkillLines.map(l => l.text) });
        
        if (retrySkillLines.length > 0) {
          log("找到选择技能，等待360秒");
          sleepMs(360000);
          return { success: true };
        }
      }
      
      log("未找到有效状态，本轮失败，进入下轮");
      return { success: false };
    }
  }
  
  return { success: false };
}

async function checkJoinResult() {
  step(9, "检查返回");

  const maxAttempts = 20;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    
    const session = captureAndOcr("returnButton");
    const returnLine = findTextLine(session.ocr.lines, "返回");

    if (returnLine) {
      log("找到返回", { attempt });
      step(10, "战斗结束");
      clickAtLine("returnButton", returnLine);
      sleepMs(500);
      return { success: true };
    }

    if (attempt % 5 === 0) {
      log("未找到返回，继续检测", { attempt, max: maxAttempts });
    }
    
    sleepMs(30000);
  }

  log("检测返回超时，本轮失败");
  return { success: false, reason: "return_timeout" };
}

async function handleSettlement() {
  step(11, "处理结算");

  sleepMs(1000);

  const session = captureAndOcr("battleStatus");

  const confirmLine = findTextLine(session.ocr.lines, "确定");
  if (confirmLine) {
    clickAtLine("battleStatus", confirmLine);
    sleepMs(300);
  }

  const receiveLine = findTextLine(session.ocr.lines, "领取");
  if (receiveLine) {
    clickAtLine("battleStatus", receiveLine);
    sleepMs(300);
  }

  const returnLine = findTextLine(session.ocr.lines, "返回");
  if (returnLine) {
    clickAtLine("battleStatus", returnLine);
    sleepMs(300);
  }

  log("结算完成");
}

async function runOneRound() {
  currentStep = 0;
  const entered = await enterRecruitChannel();
  if (!entered) {
    return { ok: false, reason: "enter_failed" };
  }

  const found = await findAndJoinRescue();
  if (!found.found) {
    return { ok: false, reason: found.reason };
  }

  const waitResult = await checkWaitingStart();
  if (!waitResult.success) {
    return { ok: false, reason: "wait_timeout" };
  }

  const returnResult = await checkJoinResult();
  if (!returnResult.success) {
    return { ok: false, reason: returnResult.reason };
  }

  await handleSettlement();

  return { ok: true };
}

async function main() {
  console.log("========== 寰球救援启动 ==========");
  console.log(`配置: browser=${browser}, runMode=${runMode}, maxRounds=${maxRounds}`);

  const results = [];

  for (let round = 1; round <= maxRounds; round++) {
    debugRound = round;
    console.log(`\n---------- 第 ${round} 轮 ----------`);

    try {
      const result = await runOneRound();
      results.push({ round, ...result });

      if (result.ok) {
        step(12, "本轮完成");
      } else {
        log("本轮失败", { reason: result.reason });
      }
    } catch (err) {
      log("本轮异常", { error: err.message });
      results.push({ round, ok: false, reason: "exception", error: err.message });
    }

    if (runMode !== "loop" && round >= maxRounds) {
      break;
    }

    sleepMs(1000);
  }

  console.log(formatMarkedResult({ ok: true, results }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
