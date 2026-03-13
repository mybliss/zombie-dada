#!/bin/zsh
set -euo pipefail

target="${1:-chrome-left}"
outfile="${2:-/tmp/browser_front_window.png}"

if [[ "$target" != "chrome" && "$target" != "chrome-left" && "$target" != "chrome-right" && "$target" != "edge" && "$target" != "edge-left" && "$target" != "left" && "$target" != "right" ]]; then
  echo "usage: $0 <chrome|chrome-left|chrome-right|edge|edge-left|left|right> [outfile]" >&2
  exit 2
fi

screen_bounds=$(osascript -e 'tell application "Finder" to get bounds of window of desktop')
IFS=', ' read -r sleft stop sright sbottom <<< "$screen_bounds"
screen_width=$((sright - sleft))
screen_height=$((sbottom - stop))
window_width=$((screen_width / 2))
right_left=$((sleft + window_width))

case "$target" in
  chrome|chrome-left|edge|edge-left|left)
    left=$sleft
    ;;
  chrome-right|right)
    left=$right_left
    ;;
esac

osascript -e 'tell application "Codex" to hide' >/dev/null 2>&1 || true
/Users/renae/Workspace/ai/tools/focus_game_window.sh "$target" >/dev/null
sleep 0.25

screencapture -R"${left},${stop},${window_width},${screen_height}" "$outfile"
echo "$outfile"
