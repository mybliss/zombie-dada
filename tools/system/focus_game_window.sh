#!/bin/zsh
set -euo pipefail

target="${1:-}"
if [[ "$target" != "chrome" && "$target" != "chrome-left" && "$target" != "chrome-right" && "$target" != "edge" && "$target" != "edge-left" && "$target" != "left" && "$target" != "right" ]]; then
  echo "usage: $0 <chrome|chrome-left|chrome-right|edge|edge-left|left|right>" >&2
  exit 2
fi

screen_bounds=$(osascript -e 'tell application "Finder" to get bounds of window of desktop')
IFS=', ' read -r sleft stop sright sbottom <<< "$screen_bounds"
screen_width=$((sright - sleft))
half_width=$((screen_width / 2))
left_right=$((sleft + half_width))

set_edge_left_bounds() {
  osascript -e "tell application \"Microsoft Edge\" to set bounds of front window to {$sleft, $stop, $left_right, $sbottom}" >/dev/null
}

set_chrome_right_bounds() {
  osascript -e "tell application \"Google Chrome\" to set bounds of front window to {$left_right, $stop, $sright, $sbottom}" >/dev/null
}

case "$target" in
  edge|edge-left)
    osascript -e 'tell application "Microsoft Edge" to activate' >/dev/null
    sleep 0.2
    set_edge_left_bounds
    echo "edge-left:$sleft,$stop,$left_right,$sbottom"
    ;;
  chrome|chrome-left|left)
    osascript -e 'tell application "Google Chrome" to activate' >/dev/null
    sleep 0.2
    osascript -e "tell application \"Google Chrome\" to set bounds of front window to {$sleft, $stop, $left_right, $sbottom}" >/dev/null
    echo "chrome-left:$sleft,$stop,$left_right,$sbottom"
    ;;
  chrome-right|right)
    osascript -e 'tell application "Google Chrome" to activate' >/dev/null
    sleep 0.2
    set_chrome_right_bounds
    echo "chrome-right:$left_right,$stop,$sright,$sbottom"
    ;;
esac
