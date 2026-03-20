export const RESCUE_CONFIG = {
  crops: {
    chatEntry: { xRatio: 0.20, yRatio: 0.89, wRatio: 0.30, hRatio: 0.09 },
    recruitTab: { xRatio: 0.18, yRatio: 0.10, wRatio: 0.64, hRatio: 0.08 },
    rescueList: { xRatio: 0.18, yRatio: 0.20, wRatio: 0.78, hRatio: 0.68 },
    battleStatus: { xRatio: 0, yRatio: 0, wRatio: 1, hRatio: 1 },
    returnButton: { xRatio: 0, yRatio: 0.50, wRatio: 1, hRatio: 0.40 },
  },

  timeouts: {
    joinWait: 5000,
    battleStart: 360000,
    battleEnd: 360000,
    pollInterval: 500,
    returnPollInterval: 30000,
  },

  successTexts: ["等待开始"],
  failTexts: ["已满", "失效", "已结束"],
  kickedTexts: ["被移出", "队伍已解散"],
  hallTexts: ["邀请", "开始游戏"],

  templates: {
    chatIcon: "liaotian.png",
    recruitTab: "zhaomu.png",
  },
};

export function getCropForSize(cropKey, width, height) {
  const crop = RESCUE_CONFIG.crops[cropKey];
  if (!crop) {
    throw new Error(`Unknown crop key: ${cropKey}`);
  }
  const x = Math.round(crop.xRatio * width);
  const y = Math.round(crop.yRatio * height);
  const w = Math.round(crop.wRatio * width);
  const h = Math.round(crop.hRatio * height);
  
  return {
    x: Math.max(0, Math.min(x, width - 1)),
    y: Math.max(0, Math.min(y, height - 1)),
    w: Math.max(1, Math.min(w, width - x)),
    h: Math.max(1, Math.min(h, height - y)),
  };
}

export const RESCUE_STATE = {
  IDLE: "idle",
  ENTERING: "entering",
  SEARCHING: "searching",
  JOINING: "joining",
  WAITING: "waiting",
  FIGHTING: "fighting",
  SETTLING: "settling",
  ERROR: "error",
};
