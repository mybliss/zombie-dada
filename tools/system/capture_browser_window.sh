#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
target="${1:-chrome-left}"
outfile="${2:-/tmp/browser_front_window.png}"

if [[ "$target" != "chrome" && "$target" != "chrome-left" && "$target" != "chrome-right" && "$target" != "edge" && "$target" != "edge-left" && "$target" != "left" && "$target" != "right" ]]; then
  echo "usage: $0 <chrome|chrome-left|chrome-right|edge|edge-left|left|right> [outfile]" >&2
  exit 2
fi

screen_width=2560
screen_height=1600
window_width=$((screen_width / 2))
sleft=0
stop=0
right_left=$window_width

case "$target" in
  chrome|chrome-left|edge|edge-left|left)
    left=$sleft
    ;;
  chrome-right|right)
    left=$right_left
    ;;
esac

"$SCRIPT_DIR/focus_game_window.sh" "$target" >/dev/null 2>&1 || true
sleep 0.25

screencapture -x -R"${left},${stop},${window_width},${screen_height}" "$outfile"
echo "$outfile"
