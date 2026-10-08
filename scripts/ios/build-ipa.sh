#!/usr/bin/env bash
# Builds an UNSIGNED iOS .ipa of Monochrome (Capacitor shell around the Vite build).
#
# Requires macOS + Xcode, Node 22+, and installed project dependencies.
# The .ipa is meant to be re-signed by a sideloading tool (AltStore, Sideloadly, TrollStore, ...).
#
# Output: build-ios/Monochrome-<version>-unsigned.ipa
set -euo pipefail

cd "$(dirname "$0")/../.."

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

echo "==> Generating iOS project"
rm -rf ios "$OUT_DIR"
mkdir -p "$OUT_DIR"
npx cap add ios
npx cap sync ios

PLIST=ios/App/App/Info.plist
PBX=ios/App/App.xcodeproj/project.pbxproj
ASSETS=ios/App/App/Assets.xcassets

echo "==> Patching Info.plist (background audio) and version ${VERSION} (${BUILD_NUMBER})"
/usr/libexec/PlistBuddy \
    -c "Add :UIBackgroundModes array" \
    -c "Add :UIBackgroundModes:0 string audio" \
    "$PLIST"
sed -i '' -E \
    -e "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = ${VERSION};/" \
    -e "s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = ${BUILD_NUMBER};/" \
    "$PBX"

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
