#!/bin/zsh
set -euo pipefail

osascript -e 'tell application "Google Chrome" to activate' >/dev/null
sleep 0.25

bounds=$(osascript -e 'tell application "Google Chrome" to get bounds of front window')
IFS=', ' read -r left top right bottom <<< "$bounds"
width=$((right - left))
height=$((bottom - top))
outfile="${1:-/tmp/chrome_front_window.png}"

screencapture -R"${left},${top},${width},${height}" "$outfile"
echo "$outfile"
