set js to "
var f = document.querySelector('iframe');
if (!f) {
  'NO_IFRAME';
} else {
  var c = f.contentDocument.querySelector('canvas');
  if (!c) {
    'NO_CANVAS';
  } else {
    try {
      c.toDataURL('image/jpeg', 0.4);
    } catch (e) {
      'ERR:' + e.message;
    }
  }
}
"

tell application "Google Chrome"
  execute active tab of front window javascript js
end tell
