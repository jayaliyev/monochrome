#!/usr/bin/env bash
# Runs the app in the iOS Simulator with the test harness and captures screenshots + logs, so playback
# and the UI can be checked in real iOS WebKit without a physical device. Requires macOS + Xcode.
#
# Output: build-ios/sim-shots/*.png, build-ios/sim-log.txt, build-ios/sim-info.txt
set -euo pipefail

cd "$(dirname "$0")/../.."

OUT_DIR="${OUT_DIR:-build-ios}"
SHOTS="$OUT_DIR/sim-shots"
BUNDLE_ID="io.github.jayaliyev.monochrome"
DURATION="${DURATION:-110}"
INTERVAL="${INTERVAL:-4}"

echo "==> Choosing a simulator"
read -r UDID NAME RUNTIME < <(
    xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
candidates = []
for runtime, entries in devices.items():
    if "iOS" not in runtime:
        continue
    for d in entries:
        n = d["name"]
        if d.get("isAvailable") and "iPhone" in n and "Pro" in n and "Max" not in n:
            candidates.append((runtime, n, d["udid"]))
candidates.sort()
runtime, name, udid = candidates[-1]
print(udid, name.replace(" ", "_"), runtime.split(".")[-1])
'
)
NAME="${NAME//_/ }"
echo "Using: $NAME ($RUNTIME) $UDID"
mkdir -p "$OUT_DIR"
echo "$NAME / $RUNTIME / $UDID" > "$OUT_DIR/sim-info.txt"

export IOS_TARGET=simulator IOS_TEST=1 SIM_UDID="$UDID"
bash scripts/ios/build-ipa.sh

APP="$OUT_DIR/derived/Build/Products/Release-iphonesimulator/App.app"
[ -d "$APP" ] || { echo "error: simulator build not found: $APP" >&2; exit 1; }

echo "==> Booting simulator"
xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 \
    --wifiBars 3 --cellularBars 4 || true
xcrun simctl ui "$UDID" appearance dark || true

echo "==> Installing and launching"
xcrun simctl install "$UDID" "$APP"
mkdir -p "$SHOTS"
xcrun simctl spawn "$UDID" log stream --level debug --style compact \
    --predicate 'process == "App" OR processImagePath CONTAINS "WebKit" OR process == "mediaserverd" OR process == "audiomxd"' \
    > "$OUT_DIR/sim-log.txt" 2>&1 &
LOG_PID=$!
sleep 2
xcrun simctl launch "$UDID" "$BUNDLE_ID"

echo "==> Capturing screenshots for ${DURATION}s"
elapsed=0
while [ "$elapsed" -le "$DURATION" ]; do
    sleep "$INTERVAL"
    elapsed=$((elapsed + INTERVAL))
    xcrun simctl io "$UDID" screenshot "$SHOTS/shot-$(printf '%03d' "$elapsed").png" >/dev/null 2>&1 || true
done

kill "$LOG_PID" 2>/dev/null || true
xcrun simctl terminate "$UDID" "$BUNDLE_ID" || true
# Keep the uploaded log small.
tail -n 4000 "$OUT_DIR/sim-log.txt" > "$OUT_DIR/sim-log.tail.txt" || true
mv "$OUT_DIR/sim-log.tail.txt" "$OUT_DIR/sim-log.txt"
echo "==> Done: $(ls "$SHOTS" | wc -l | tr -d ' ') screenshots in $SHOTS"
