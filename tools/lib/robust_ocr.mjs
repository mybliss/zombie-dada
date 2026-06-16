import fs from "fs";
import { normalizeText, runCommand, runTool, sleepMs } from "./runtime.mjs";
import { clickScreenPoint, getDisplayScale, getWindowBounds } from "./screen.mjs";

const OCR_BIN = "/tmp/ocr_text";
const keepDebugImages = process.env.KEEP_DEBUG_IMAGES === "1";

// ---------------------------------------------------------------------------
// Treat OCR as a noisy sensor. Instead of "OCR once, match exact text, click",
// we sample several frames, keep only candidates inside the expected region,
// score them (fuzzy text + confidence + region), cluster by location, and only
// click once enough frames agree on roughly the same spot. After clicking we
// verify the expected next-state text appears, and retry a bounded number of
// times. See tools/lib/robust_ocr usage in flows.
// ---------------------------------------------------------------------------

function cleanup(...paths) {
  if (keepDebugImages) return;
  for (const p of paths) {
    if (!p) continue;
    try { fs.unlinkSync(p); } catch {}
  }
}

// Capture the full browser window (no focus/rebound) and OCR it. Returns lines
// in image pixels plus the image dimensions for region math.
export function captureWindowOcr(browser, suffix = "robust") {
  const path = `/tmp/${browser}_${suffix}_${process.pid}_${Date.now()}.png`;
  runTool("system/capture_browser_window.sh", [browser, path, "--no-focus"]);
  for (let i = 0; i < 8; i += 1) {
    try {
      if (fs.statSync(path).size > 0) break;
    } catch { /* keep waiting */ }
    sleepMs(60);
  }
  let ocr = null;
  let lastErr = null;
  for (let i = 0; i < 4; i += 1) {
    try { ocr = JSON.parse(runCommand(OCR_BIN, [path])); break; }
    catch (e) { lastErr = e; sleepMs(80); }
  }
  cleanup(path);
  if (!ocr) throw lastErr;
  const dims = ocr.lines.reduce(
    (acc, l) => ({
      w: Math.max(acc.w, l.x + l.width),
      h: Math.max(acc.h, l.y + l.height),
    }),
    { w: 0, h: 0 },
  );
  return { lines: ocr.lines, width: dims.w, height: dims.h };
}

// region is normalized {xMin,xMax,yMin,yMax} (0..1). Lines outside are rejected
// before text matching, which keeps browser chrome / menu bar / wrong-context
// strings from ever being clicked.
function insideRegion(line, region, width, height) {
  if (!region) return true;
  const nx = width ? line.centerX / width : 0;
  const ny = height ? line.centerY / height : 0;
  if (region.xMin != null && nx < region.xMin) return false;
  if (region.xMax != null && nx > region.xMax) return false;
  if (region.yMin != null && ny < region.yMin) return false;
  if (region.yMax != null && ny > region.yMax) return false;
  return true;
}

function regionCenterScore(line, region, width, height) {
  if (!region) return 0.5;
  const nx = width ? line.centerX / width : 0.5;
  const ny = height ? line.centerY / height : 0.5;
  const cx = ((region.xMin ?? 0) + (region.xMax ?? 1)) / 2;
  const cy = ((region.yMin ?? 0) + (region.yMax ?? 1)) / 2;
  const d = Math.hypot(nx - cx, ny - cy);
  return Math.max(0, 1 - d);
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Group observations whose centers fall within maxDistPx of the cluster.
function clusterByLocation(observations, maxDistPx) {
  const clusters = [];
  for (const obs of observations) {
    let placed = false;
    for (const c of clusters) {
      if (Math.hypot(obs.x - c.cx, obs.y - c.cy) <= maxDistPx) {
        c.items.push(obs);
        c.cx = median(c.items.map((o) => o.x));
        c.cy = median(c.items.map((o) => o.y));
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ cx: obs.x, cy: obs.y, items: [obs] });
  }
  return clusters;
}

// ---------------------------------------------------------------------------
// Text matchers (return a 0..1 score). Build targets from these.
// ---------------------------------------------------------------------------

// Exact/contains matcher for one or more accepted words.
export function textMatcher(words, { exclude = [] } = {}) {
  const ws = words.map(normalizeText);
  const ex = exclude.map(normalizeText);
  return (line) => {
    const t = normalizeText(line.text);
    if (ex.some((e) => t.includes(e))) return 0;
    for (const w of ws) {
      if (t === w) return 1;
      if (t.includes(w)) return 0.85;
    }
    return 0;
  };
}

// "邀请" button matcher tolerant of OCR variants (邀清/邀唷/...) and the case
// where only the leading "+" glyph survives. Excludes 邀请码 / 输入 / 一键 / 组队.
export function inviteMatcher(line) {
  const t = normalizeText(line.text);
  if (t.includes("码") || t.includes("输") || t.includes("一键") || t.includes("组队")) return 0;
  if (t.includes("邀请")) return 1;
  if (/邀[请清唷啨喷啬]/.test(t)) return 0.85;
  if (t.startsWith("邀")) return 0.6;
  if (t === "+") return 0.4;
  return 0;
}

// ---------------------------------------------------------------------------
// Core primitive: gather multi-frame consensus, then click the agreed point.
// ---------------------------------------------------------------------------
function collectCandidates(frame, target) {
  const out = [];
  for (const line of frame.lines) {
    if (!insideRegion(line, target.region, frame.width, frame.height)) continue;
    if ((line.confidence ?? 1) < (target.minConfidence ?? 0)) continue;
    const textScore = target.match(line);
    if (textScore <= 0) continue;
    const conf = Math.min(Math.max(line.confidence ?? 0.5, 0), 1);
    const regionScore = regionCenterScore(line, target.region, frame.width, frame.height);
    out.push({
      text: line.text,
      x: line.centerX,
      y: line.centerY,
      score: textScore * 0.7 + conf * 0.2 + regionScore * 0.1,
    });
  }
  return out;
}

function pickBestCluster(observations, target) {
  const clusters = clusterByLocation(observations, target.maxClusterDistancePx ?? 80);
  return clusters
    .map((c) => ({
      hits: c.items.length,
      medianX: median(c.items.map((o) => o.x)),
      medianY: median(c.items.map((o) => o.y)),
      avgScore: c.items.reduce((s, o) => s + o.score, 0) / c.items.length,
      texts: [...new Set(c.items.map((o) => o.text))],
    }))
    .filter((c) => c.hits >= (target.requiredHits ?? 2))
    .sort((a, b) => b.avgScore - a.avgScore)[0] || null;
}

function imageToScreen(browser, x, y) {
  const bounds = getWindowBounds(browser);
  const scale = getDisplayScale();
  return { screenX: bounds.left + x / scale, screenY: bounds.top + y / scale };
}

/**
 * Sample frames until a target clusters consistently, then click its median
 * location. Returns {clicked, point, evidence} or {clicked:false, reason}.
 *
 * target: {
 *   name, match(line)->0..1, region?, minConfidence?,
 *   frames?, requiredHits?, maxClusterDistancePx?
 * }
 */
export function waitForStableTextAndClick(browser, target, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 6000;
  const pollMs = opts.pollMs ?? 180;
  const dryRun = opts.dryRun ?? false;
  const deadline = Date.now() + timeoutMs;
  let observations = [];

  while (Date.now() < deadline) {
    let frame = null;
    try { frame = captureWindowOcr(browser, "rstable"); } catch { /* retry */ }
    if (frame) {
      observations.push(...collectCandidates(frame, target));
      if (observations.length > 120) observations = observations.slice(-120);
      const best = pickBestCluster(observations, target);
      if (best) {
        const { screenX, screenY } = imageToScreen(browser, best.medianX, best.medianY);
        if (!dryRun) clickScreenPoint(screenX, screenY);
        return {
          clicked: true,
          point: { screenX: Number(screenX.toFixed(2)), screenY: Number(screenY.toFixed(2)) },
          imagePoint: { x: Math.round(best.medianX), y: Math.round(best.medianY) },
          evidence: { hits: best.hits, avgScore: Number(best.avgScore.toFixed(3)), texts: best.texts },
          target: target.name,
        };
      }
    }
    sleepMs(pollMs);
  }
  return { clicked: false, reason: "stable_target_not_found", target: target.name };
}

// ---------------------------------------------------------------------------
// Verification: confirm the expected next-state text appeared.
// ---------------------------------------------------------------------------

/**
 * Poll until any of `anyText` shows up inside `region` (or anywhere if none).
 * Returns {ok, matchedText} or {ok:false}.
 */
export function waitForCondition(browser, condition, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 3000;
  const pollMs = opts.pollMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  const matchers = (condition.anyText || []).map((w) => normalizeText(w));
  while (Date.now() < deadline) {
    let frame = null;
    try { frame = captureWindowOcr(browser, "rverify"); } catch { /* retry */ }
    if (frame) {
      for (const line of frame.lines) {
        if (!insideRegion(line, condition.region, frame.width, frame.height)) continue;
        const t = normalizeText(line.text);
        const hit = matchers.find((m) => t.includes(m));
        if (hit) return { ok: true, matchedText: line.text };
      }
    }
    sleepMs(pollMs);
  }
  return { ok: false };
}

// ---------------------------------------------------------------------------
// Step wrapper: click a target, then verify next-state, retrying the whole
// thing a bounded number of times. Fits the existing discrete-step pipeline.
// ---------------------------------------------------------------------------

/**
 * step: {
 *   name, browser, clickTarget, clickOptions?,
 *   verify?, verifyTimeoutMs?, postClickDelayMs?,
 *   attempts?, retryDelayMs?, preSettle?
 * }
 */
export function performStep(step) {
  const attempts = step.attempts ?? 3;
  let lastClick = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (step.preSettle) {
      waitForOcrSettle(step.browser, step.preSettle);
    }
    const clickResult = waitForStableTextAndClick(step.browser, step.clickTarget, step.clickOptions || {});
    lastClick = clickResult;
    if (!clickResult.clicked) {
      sleepMs(step.retryDelayMs ?? 600);
      continue;
    }
    if (step.postClickDelayMs) sleepMs(step.postClickDelayMs);
    if (!step.verify) return { ok: true, step: step.name, attempt, clickResult };
    const verified = waitForCondition(step.browser, step.verify, {
      timeoutMs: step.verifyTimeoutMs ?? 2500,
      pollMs: step.verifyPollMs ?? 250,
    });
    if (verified.ok) return { ok: true, step: step.name, attempt, clickResult, verified };
    sleepMs(step.retryDelayMs ?? 700);
  }
  return { ok: false, step: step.name, reason: "step_not_verified_after_retries", lastClick };
}

// ---------------------------------------------------------------------------
// Narrow settle guard: proceed only when the OCR line-set stabilizes across
// frames. Use before known animated transitions (popup open, tab switch, etc).
// Returns true if stabilized, false on timeout (caller treats as soft guard).
// ---------------------------------------------------------------------------
function ocrSignature(lines, region, width, height) {
  return lines
    .filter((l) => (l.confidence ?? 1) >= 0.2)
    .filter((l) => insideRegion(l, region, width, height))
    .map((l) => `${normalizeText(l.text)}@${Math.round(l.centerX / 80)},${Math.round(l.centerY / 80)}`)
    .sort()
    .join("|");
}

export function waitForOcrSettle(browser, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 2500;
  const intervalMs = opts.intervalMs ?? 250;
  const needed = opts.minStableFrames ?? 2;
  const deadline = Date.now() + timeoutMs;
  let prev = null;
  let stable = 0;
  while (Date.now() < deadline) {
    let frame = null;
    try { frame = captureWindowOcr(browser, "rsettle"); } catch { /* retry */ }
    if (frame) {
      const sig = ocrSignature(frame.lines, opts.region, frame.width, frame.height);
      if (prev !== null && sig === prev) {
        stable += 1;
        if (stable >= needed) return true;
      } else {
        stable = 0;
      }
      prev = sig;
    }
    sleepMs(intervalMs);
  }
  return false;
}
