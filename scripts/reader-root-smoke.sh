#!/usr/bin/env bash
# Issue #3: real reader root + PDF navigation, without unit/test-host isolation.
# This is not the provider-backed full acceptance.sh golden path.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ART="${RUNNER_TEMP:-$ROOT/test-results}/reader-root-smoke"
mkdir -p "$ART"
APP_PID=""; DUMMY_PID=""
cleanup() {
  if [ -n "$APP_PID" ]; then kill "$APP_PID" 2>/dev/null || true; fi
  if [ -n "$DUMMY_PID" ]; then kill "$DUMMY_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT
sample_host() {
  if [ -n "$APP_PID" ]; then
    sample "$APP_PID" 3 -file "$ART/reader-host.sample" >/dev/null 2>&1 || true
    grep -E -C 3 'TabContainerView|MainView|PageFlowApp|TabManager|VibeReader.debug' "$ART/reader-host.sample" | head -220 || true
    ps -p "$APP_PID" -o pid,etime,%cpu,state,command || true
  fi
}
stage="preflight"
error_diagnostics() {
  local status=$?
  echo "READER_ROOT_SMOKE_FAIL: stage=$stage line=$1 status=$status"
  tail -n 25 "$ART/build.log" 2>/dev/null || true
  cat "$ART/unavailable.log" 2>/dev/null || true
  sample_host
  exit "$status"
}
trap 'error_diagnostics $LINENO' ERR
[ "$(uname -s)" = Darwin ] || { echo "macOS required"; exit 2; }
[ -z "${VIBEREADER_UNIT_TEST_HOST:-}" ] && [ -z "${VIBEREADER_TEST_HOST:-}" ]
if pgrep -x VibeReader >/dev/null; then echo "Existing reader; refusing ambiguous attribution"; exit 2; fi
stage="build"; echo "Stage: $stage"
scripts/build-native.sh >"$ART/build.log" 2>&1
APP_DIR="$(xcodebuild -project "$ROOT/apps/vibereader-macos/PageFlow.xcodeproj" -scheme PageFlow -configuration Debug -showBuildSettings 2>/dev/null | awk '/ BUILT_PRODUCTS_DIR =/ && !printed {print $3; printed=1}')"
APP="$APP_DIR/VibeReader.app"
FIXTURE="$ART/reader-startup-sample.pdf"
cp "$ROOT/test-fixtures/acceptance-sample.pdf" "$FIXTURE"
# Normal returning-user preference, not a test-host bypass. No default-handler change.
defaults write cn.yishuziyu.vibereader-macos hasShownDefaultPDFPrompt -bool true
cat > "$ART/unavailable.py" <<'PYTHON'
from http.server import BaseHTTPRequestHandler, HTTPServer
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(500); self.end_headers(); self.wfile.write(b"unavailable")
    do_POST = do_GET
HTTPServer(("127.0.0.1",8766),H).serve_forever()
PYTHON
if lsof -ti tcp:8766 >/dev/null 2>&1; then
  echo "Port 8766 already occupied; refusing unknown service"; exit 2
fi
python3 "$ART/unavailable.py" >"$ART/unavailable.log" 2>&1 &
DUMMY_PID=$!
stage="unavailable-service"; echo "Stage: $stage"
HTTP_CODE=000
for _ in $(seq 1 10); do
  kill -0 "$DUMMY_PID"
  HTTP_CODE="$(curl -s -o "$ART/unavailable-response.txt" -w '%{http_code}' -m 3 http://127.0.0.1:8766/api/health || true)"
  [ "$HTTP_CODE" = 500 ] && break
  sleep 1
done
[ "$HTTP_CODE" = 500 ]
echo "Verified unavailable service: HTTP $HTTP_CODE"
stage="normal-app-launch"; echo "Stage: $stage"
open -n -a "$APP" "$FIXTURE"
for _ in $(seq 1 20); do
  APP_PID="$(pgrep -x VibeReader | head -1 || true)"
  [ -n "$APP_PID" ] && break
  sleep 1
done
[ -n "$APP_PID" ]
[ "$(ps -p "$APP_PID" -o comm=)" = "$APP/Contents/MacOS/VibeReader" ]
stage="startup-settle"; echo "Stage: $stage pid=$APP_PID"
sleep 12
sample_host
stage="first-page-OCR"; echo "Stage: $stage"
swift "$ROOT/scripts/reader-root-capture.swift" "$APP_PID" reader-startup-sample "$ART/page-1.png" 第一章
osascript - "$APP_PID" <<'APPLESCRIPT'
on run argv
 tell application "System Events"
  tell (first process whose unix id is (item 1 of argv as integer))
   set frontmost to true
   click menu item "Next Page" of menu "Go" of menu bar item "Go" of menu bar 1
  end tell
 end tell
end run
APPLESCRIPT
sleep 3
swift "$ROOT/scripts/reader-root-capture.swift" "$APP_PID" reader-startup-sample "$ART/page-2.png" 第二章
! cmp -s "$ART/page-1.png.txt" "$ART/page-2.png.txt"
osascript - "$APP_PID" <<'APPLESCRIPT'
on run argv
 tell application "System Events"
  tell (first process whose unix id is (item 1 of argv as integer))
   click menu item "Previous Page" of menu "Go" of menu bar item "Go" of menu bar 1
  end tell
 end tell
end run
APPLESCRIPT
sleep 3
swift "$ROOT/scripts/reader-root-capture.swift" "$APP_PID" reader-startup-sample "$ART/recovery-page-1.png" 第一章
kill -0 "$APP_PID"
echo "READER_ROOT_SMOKE_PASS: normal root, actual PDF text, Next/Previous navigation, unavailable service recovery"
