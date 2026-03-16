#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP_DIR="/tmp"

info() {
  printf '[setup] %s\n' "$1"
}

fail() {
  printf '[setup] %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    fail "缺少命令：$cmd。$hint"
  fi
}

compile_swift_tool() {
  local source_file="$1"
  local output_file="$2"
  shift 2
  info "编译 $(basename "$source_file") -> $output_file"
  xcrun --sdk macosx swiftc "$source_file" "$@" -o "$output_file"
}

check_browser() {
  local app_name="$1"
  if ! osascript -e "id of application \"$app_name\"" >/dev/null 2>&1; then
    fail "未找到浏览器：$app_name"
  fi
}

info "开始初始化环境"

require_cmd "node" "请先安装 Node.js。"
require_cmd "npm" "npm 会随 Node.js 一起安装。"
require_cmd "xcrun" "请先安装 Xcode Command Line Tools。"
require_cmd "osascript" "当前脚本只支持 macOS。"

check_browser "Microsoft Edge"
check_browser "Google Chrome"

info "安装 npm 依赖"
cd "$ROOT_DIR"
npm install

info "编译本地 Swift 工具"
compile_swift_tool "$ROOT_DIR/tools/chrome_click.swift" "$TMP_DIR/chrome_click" -framework AppKit
compile_swift_tool "$ROOT_DIR/tools/ocr_text.swift" "$TMP_DIR/ocr_text" -framework Vision -framework AppKit

if [[ -f "$ROOT_DIR/tools/chrome_move.swift" ]]; then
  compile_swift_tool "$ROOT_DIR/tools/chrome_move.swift" "$TMP_DIR/chrome_move" -framework AppKit
fi

if [[ -f "$ROOT_DIR/tools/record_clicks.swift" ]]; then
  compile_swift_tool "$ROOT_DIR/tools/record_clicks.swift" "$TMP_DIR/record_clicks" -framework AppKit
fi

cat <<'EOF'

[setup] 初始化完成。

后续仍需要你手动确认这些系统权限已开启：
- 辅助功能
- 屏幕录制

推荐下一步：
1. ./tools/start_game_windows.sh
2. 登录 Edge 和 Chrome 两个账号
3. node /Users/renae/Workspace/ai/tools/send_and_accept.mjs 'Yuxi'

EOF
