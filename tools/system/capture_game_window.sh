#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
target="${1:-chrome-left}"
outfile="${2:-/tmp/browser_front_window.png}"

if [[ "$target" != "chrome" && "$target" != "chrome-left" && "$target" != "chrome-right" && "$target" != "edge" && "$target" != "edge-left" && "$target" != "left" && "$target" != "right" ]]; then
  echo "usage: $0 <chrome|chrome-left|chrome-right|edge|edge-left|left|right> [outfile]" >&2
  exit 2
fi

case "$target" in
  chrome|chrome-left|chrome-right|right)
    app_name="Google Chrome"
    ;;
  edge|edge-left|left)
    app_name="Microsoft Edge"
    ;;
esac

osascript -e "tell application \"$app_name\" to activate" >/dev/null 2>&1 || true
sleep 0.3

temp_full="/tmp/capture_full_${$}.png"
screencapture -x "$temp_full"

game_info=$(/tmp/ocr_text "$temp_full" 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)

game_title_y = None
game_title_h = None
game_right_x = None

for line in data.get('lines', []):
    text = line.get('text', '')
    x = line.get('x', 0)
    
    if text == '向僵尸开炮':
        game_title_y = int(line.get('y', 0))
        game_title_h = int(line.get('height', 30))
    
    if '退出全屏' in text:
        game_right_x = int(x) + int(line.get('width', 100))

if game_title_y is not None:
    game_y = game_title_y + game_title_h + 5
    print(f'{game_y},{game_right_x or 938}')
" 2>/dev/null || echo "")

if [[ -n "$game_info" ]]; then
  IFS=',' read -r game_y game_width <<< "$game_info"
  
  python3 -c "
from PIL import Image
import json

img = Image.open('$temp_full')
screen_width, screen_height = img.size

game_y = $game_y
game_width = $game_width

cropped = img.crop((0, game_y, game_width, screen_height))
cropped.save('$outfile')

crop_info = {
    'offset_x': 0,
    'offset_y': game_y
}
with open('${outfile}.json', 'w') as f:
    json.dump(crop_info, f)
"
else
  cp "$temp_full" "$outfile"
  echo '{"offset_x": 0, "offset_y": 0}' > "${outfile}.json"
fi

rm -f "$temp_full"
echo "$outfile"
