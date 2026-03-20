#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
url="${1:-https://www.wanyiwan.top/game/xjskp2060170000353846}"

screen_bounds=$(osascript -e 'tell application "Finder" to get bounds of window of desktop')
IFS=', ' read -r sleft stop sright sbottom <<< "$screen_bounds"
screen_width=$((sright - sleft))
half_width=$((screen_width / 2))

wait_for_browser_window() {
  local app_name="$1"
  local retries=60
  while (( retries > 0 )); do
    local count
    count=$(osascript -e "tell application \"$app_name\" to count windows" 2>/dev/null || echo 0)
    if [[ "$count" =~ ^[0-9]+$ ]] && (( count >= 1 )); then
      return 0
    fi
    sleep 0.25
    ((retries--))
  done
  echo "timed out waiting for window in $app_name" >&2
  return 1
}

open -na "Microsoft Edge" --args --new-window "$url"
wait_for_browser_window "Microsoft Edge"
"$SCRIPT_DIR/focus_game_window.sh" edge-left >/dev/null
sleep 0.5
osascript -e "tell application \"Microsoft Edge\" to set bounds of front window to {$sleft, $stop, $((sleft + half_width)), $sbottom}"

"$SCRIPT_DIR/focus_game_window.sh" edge-left >/dev/null
echo "browser=edge"
