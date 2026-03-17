#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP_DIR="/tmp"
BIN_DIR="$ROOT_DIR/bin/macos-arm64"
info() {
  printf '[setup] %s\n' "$1"
}

fail() {
  printf '[setup] %s\n' "$1" >&2
  exit 1
}

warn() {
  printf '[setup] %s\n' "$1" >&2
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
  if ! xcrun swiftc "$source_file" "$@" -o "$output_file"; then
    warn "Swift 工具编译失败：$(basename "$source_file")"
    warn "这通常是 Xcode Command Line Tools / SDK / Swift 编译器版本不匹配。"
    warn "建议处理方式："
    warn "1. 执行 xcode-select --install 更新 Command Line Tools"
    warn "2. 如果已安装完整 Xcode，执行 sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
    warn "3. 重新打开终端后再次运行 ./setup.sh"
    fail "无法完成 Swift 工具编译。"
  fi
}

install_prebuilt_or_compile() {
  local tool_name="$1"
  local source_file="$2"
  shift 2
  local output_file="$TMP_DIR/$tool_name"
  local prebuilt_file="$BIN_DIR/$tool_name"

  if [[ -f "$prebuilt_file" ]]; then
    info "使用预编译工具 $tool_name"
    cp "$prebuilt_file" "$output_file"
    chmod +x "$output_file"
    return 0
  fi

  compile_swift_tool "$source_file" "$output_file" "$@"
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

info "Swift 版本：$(xcrun swiftc --version | head -n 1)"

check_browser "Microsoft Edge"
check_browser "Google Chrome"

info "安装 npm 依赖"
cd "$ROOT_DIR"
npm install

info "准备本地 Swift 工具"
install_prebuilt_or_compile "chrome_click" "$ROOT_DIR/tools/native/chrome_click.swift" -framework AppKit
install_prebuilt_or_compile "ocr_text" "$ROOT_DIR/tools/native/ocr_text.swift" -framework Vision -framework AppKit

cat <<'EOF'

[setup] 初始化完成。

后续仍需要你手动确认这些系统权限已开启：
- 辅助功能
- 屏幕录制

推荐下一步：
1. ./start_windows.sh
2. 登录 Edge 和 Chrome 两个账号
3. node ./run.mjs 'Yuxi'

EOF
