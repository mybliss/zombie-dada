#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
url="${1:-https://www.wanyiwan.top/game/xjskp2060170000353846}"
account_b_dir="/tmp/codex-game-account-b"

screen_bounds=$(osascript -e 'tell application "Finder" to get bounds of window of desktop')
IFS=', ' read -r sleft stop sright sbottom <<< "$screen_bounds"
screen_width=$((sright - sleft))
half_width=$((screen_width / 2))
right_left=$((sleft + half_width))

wait_for_browser_windows() {
  local app_name="$1"
  local min_windows="$2"
  local retries=60
  while (( retries > 0 )); do
    local count
    count=$(osascript -e "tell application \"$app_name\" to count windows" 2>/dev/null || echo 0)
    if [[ "$count" =~ ^[0-9]+$ ]] && (( count >= min_windows )); then
      return 0
    fi
    sleep 0.25
    ((retries--))
  done
  echo "timed out waiting for $min_windows windows in $app_name" >&2
  return 1
}

open -na "Microsoft Edge" --args --new-window "$url"
wait_for_browser_windows "Microsoft Edge" 1
"$SCRIPT_DIR/focus_game_window.sh" edge-left >/dev/null
sleep 0.5
osascript -e "tell application \"Microsoft Edge\" to set bounds of front window to {$sleft, $stop, $((sleft + half_width)), $sbottom}"

open -na "Google Chrome" --args --user-data-dir="$account_b_dir" --new-window "$url"
wait_for_browser_windows "Google Chrome" 1
"$SCRIPT_DIR/focus_game_window.sh" chrome-right >/dev/null
sleep 0.5
osascript -e "tell application \"Google Chrome\" to set bounds of front window to {$right_left, $stop, $sright, $sbottom}"

"$SCRIPT_DIR/focus_game_window.sh" edge-left >/dev/null
echo "account_a=edge"
echo "account_b=$account_b_dir"
