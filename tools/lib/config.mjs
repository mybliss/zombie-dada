export const BROWSERS = {
  accountA: "edge-left",
  accountB: "chrome-right",
};

export const CROPS = {
  rightInvite: ["--x", "500", "--y", "850", "--w", "1100", "--h", "1050"],
  rightConfirm: ["--x", "450", "--y", "650", "--w", "1300", "--h", "1100"],
  edgeStart: ["--x", "450", "--y", "1700", "--w", "650", "--h", "420"],
  returnRegion: ["--x", "0", "--y", "1200", "--w", "1000", "--h", "900"],
  inviteListRegion: { x: 260, y: 330, w: 1250, h: 1220 },
  hallBottomInviteRegion: { x: 240, y: 1500, w: 1100, h: 520 },
};

export const TIMINGS = {
  acceptInviteTimeoutMs: 15000,
  acceptInvitePollMs: 200,
  acceptConfirmTimeoutMs: 5000,
  roomWaitShortMs: 1200,
  roomWaitLongMs: 1800,
  focusSettleMs: 250,
  postAcceptSettleMs: 200,
  beforeStartSettleMs: 0,
  postStartSettleMs: 1000,
  returnTimeoutMs: 600000,
  returnPollMs: 10000,
  returnInitialDelayMs: 360000,
  invitePopupOpenSettleMs: 180,
  inviteFriendsTabSettleMs: 300,
};

export const WINDOW_ROLE_BROWSERS = {
  "edge-left": "Microsoft Edge",
  "chrome-right": "Google Chrome",
};

export const RECOVERY = {
  edgeLeftHall: {
    browser: "edge-left",
    screenshotPath: "/tmp/edge_left_hall_check.png",
    maxAttempts: 4,
    settleMs: 800,
    readyTexts: ["开始游戏", "邀请"],
    actions: [
      { type: "text", text: "返回" },
      { type: "text", text: "离开" },
      { type: "text", text: "确定" },
      { type: "popupClose", markerText: "组队邀请", point: { x: 920, y: 480 } },
    ],
    failureReason: "edge_left_hall_not_ready",
  },
  chromeRightHall: {
    browser: "chrome-right",
    screenshotPath: "/tmp/chrome_right_hall_check.png",
    maxAttempts: 2,
    settleMs: 500,
    readyTexts: ["邀请"],
    actions: [
      { type: "text", text: "返回" },
    ],
    failureReason: "chrome_right_hall_not_ready",
  },
  edgeStartHall: {
    browser: "edge-left",
    screenshotPath: "/tmp/chrome_hall_check.png",
    maxAttempts: 2,
    settleMs: 400,
    readyTexts: ["开始游戏", "开始"],
    actions: [
      { type: "popupClose", markerText: "组队邀请", point: { x: 920, y: 480 } },
    ],
    failureReason: "hall_not_ready",
  },
};

export const INVITE_FLOW = {
  hallInviteCandidates: [
    { deltaX: 0, deltaY: 0 },
    { deltaX: -80, deltaY: 4 },
    { deltaX: -130, deltaY: 8 },
  ],
  popupFriendsRetryCount: 4,
};
