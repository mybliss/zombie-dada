#!/bin/zsh
set -euo pipefail

target="${1:-}"
if [[ "$target" != "chrome" && "$target" != "chrome-left" && "$target" != "chrome-right" && "$target" != "edge" && "$target" != "edge-left" && "$target" != "left" && "$target" != "right" ]]; then
  echo "usage: $0 <chrome|chrome-left|chrome-right|edge|edge-left|left|right>" >&2
  exit 2
fi

case "$target" in
  edge|edge-left|left)
    osascript -e 'tell application "Microsoft Edge" to activate' 2>/dev/null || true
    ;;
  chrome|chrome-left|chrome-right|right)
    osascript -e 'tell application "Google Chrome" to activate' 2>/dev/null || true
    ;;
esac

sleep 0.2
echo "window focused: $target"
