#!/usr/bin/env bash
# Builds the Monochrome iOS app (Capacitor shell around the Vite build).
#
# Requires macOS + Xcode, Node 22+, and installed project dependencies.
#
#   IOS_TARGET=device     (default) unsigned .ipa for sideloading (AltStore, Sideloadly, TrollStore, ...)
#   IOS_TARGET=simulator  .app for the iOS Simulator (used by simulator-test.sh)
#   IOS_TEST=1|probe      also bundle scripts/ios/test-harness.js (or audio-probe.js); simulator tests only
#
# Output (device): build-ios/Monochrome-<version>-unsigned.ipa
set -euo pipefail

cd "$(dirname "$0")/../.."

IOS_TARGET="${IOS_TARGET:-device}"
IOS_TEST="${IOS_TEST:-0}"
VERSION="$(node -p "require('./package.json').version")"
BUILD_NUMBER="${BUILD_NUMBER:-1}"
OUT_DIR="${OUT_DIR:-build-ios}"

# The CLI generates the native template, so it must match the installed @capacitor/ios version exactly
# (a newer CLI emits Swift that older @capacitor/ios releases don't provide).
CAP_VERSION="$(node -p "require('@capacitor/ios/package.json').version")"
if [ ! -x node_modules/.bin/cap ]; then
    echo "==> Installing @capacitor/cli@${CAP_VERSION} (not a dependency of the project)"
    npm install --no-save --no-package-lock --legacy-peer-deps "@capacitor/cli@${CAP_VERSION}"
fi

echo "==> Building web app"
npx vite build

if [ "$IOS_TEST" != "0" ]; then
    case "$IOS_TEST" in
        probe) HARNESS=scripts/ios/audio-probe.js ;;
        *) HARNESS=scripts/ios/test-harness.js ;;
    esac
    echo "==> Injecting simulator test harness ($HARNESS)"
    HARNESS="$HARNESS" python3 - <<'PY'
import os, pathlib
index = pathlib.Path("dist/index.html")
harness = pathlib.Path(os.environ["HARNESS"]).read_text()
html = index.read_text()
assert "</body>" in html, "dist/index.html has no </body>"
index.write_text(html.replace("</body>", "<script>\n" + harness + "\n</script>\n</body>", 1))
PY
fi

echo "==> Generating iOS project"
rm -rf ios "$OUT_DIR"
mkdir -p "$OUT_DIR"
npx cap add ios
npx cap sync ios

PLIST=ios/App/App/Info.plist
PBX=ios/App/App.xcodeproj/project.pbxproj
ASSETS=ios/App/App/Assets.xcassets

echo "==> Patching Info.plist and version ${VERSION} (${BUILD_NUMBER})"
PB=/usr/libexec/PlistBuddy
"$PB" -c "Add :UIBackgroundModes array" -c "Add :UIBackgroundModes:0 string audio" "$PLIST"
"$PB" -c "Add :UIUserInterfaceStyle string Dark" "$PLIST"
"$PB" -c "Add :ITSAppUsesNonExemptEncryption bool false" "$PLIST"
"$PB" -c "Set :UIRequiredDeviceCapabilities:0 arm64" "$PLIST"
# iPhone is portrait-only (the mobile layout is designed for it); iPad keeps all orientations.
"$PB" -c "Delete :UISupportedInterfaceOrientations:2" -c "Delete :UISupportedInterfaceOrientations:1" "$PLIST"
sed -i '' -E \
    -e "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = ${VERSION};/" \
    -e "s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = ${BUILD_NUMBER};/" \
    "$PBX"

echo "==> Patching native code (audio session, main view controller)"
python3 scripts/ios/patch-native.py ios/App/App

echo "==> Generating app icon and splash from assets/icon-only.png"
TMP="$(mktemp -d)"
# Going through JPEG drops the alpha channel (iOS app icons must be opaque).
sips -z 1024 1024 -s format jpeg assets/icon-only.png --out "$TMP/icon.jpg" >/dev/null
sips -s format png "$TMP/icon.jpg" --out "$ASSETS/AppIcon.appiconset/AppIcon-512@2x.png" >/dev/null
# Splash: logo centred on a black square (replaces the default Capacitor splash).
sips -s format png "$TMP/icon.jpg" --out "$TMP/logo.png" >/dev/null
sips --padToHeightWidth 2732 2732 --padColor 000000 "$TMP/logo.png" --out "$TMP/splash.png" >/dev/null
for f in "$ASSETS"/Splash.imageset/*.png; do
    cp "$TMP/splash.png" "$f"
done
rm -rf "$TMP"

if [ "$IOS_TARGET" = "simulator" ]; then
    : "${SIM_UDID:?SIM_UDID must be set for IOS_TARGET=simulator}"
    echo "==> Compiling for the iOS Simulator (${SIM_UDID})"
    xcodebuild \
        -project ios/App/App.xcodeproj \
        -scheme App \
        -configuration Release \
        -sdk iphonesimulator \
        -destination "platform=iOS Simulator,id=${SIM_UDID}" \
        -derivedDataPath "$OUT_DIR/derived" \
        CODE_SIGNING_ALLOWED=NO \
        build
    echo "==> Done: $OUT_DIR/derived/Build/Products/Release-iphonesimulator/App.app"
    exit 0
fi

echo "==> Compiling (Release, no code signing)"
xcodebuild \
    -project ios/App/App.xcodeproj \
    -scheme App \
    -configuration Release \
    -sdk iphoneos \
    -destination 'generic/platform=iOS' \
    -derivedDataPath "$OUT_DIR/derived" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGN_IDENTITY="" \
    build

APP="$OUT_DIR/derived/Build/Products/Release-iphoneos/App.app"
if [ ! -d "$APP" ]; then
    echo "error: expected build product not found: $APP" >&2
    exit 1
fi

echo "==> Packaging .ipa"
mkdir -p "$OUT_DIR/Payload"
cp -R "$APP" "$OUT_DIR/Payload/"
IPA="Monochrome-${VERSION}-unsigned.ipa"
(cd "$OUT_DIR" && zip -qry "$IPA" Payload)
rm -rf "$OUT_DIR/Payload"

echo "==> Done: $OUT_DIR/$IPA"
