set js to "1+1"

tell application "Google Chrome"
  set t to active tab of front window
  execute t javascript js
end tell
