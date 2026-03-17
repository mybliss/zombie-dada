function stamp() {
  return new Date().toISOString();
}

export function appendLog(event) {
  const payload = {
    ts: stamp(),
    ...event,
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function logStepStart(step, extra = {}) {
  appendLog({ level: "info", type: "step_start", step, ...extra });
}

export function logStepOk(step, extra = {}) {
  appendLog({ level: "info", type: "step_ok", step, ...extra });
}

export function logStepError(step, extra = {}) {
  appendLog({ level: "error", type: "step_error", step, ...extra });
}

export function logRound(round, phase, extra = {}) {
  appendLog({ level: "info", type: "round", round, phase, ...extra });
}
