#!/bin/bash
# Build script — packages Chrome and Firefox versions

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/dist"
rm -rf "$OUT"
mkdir -p "$OUT"

# Shared files
SHARED="background content icons lib popup LICENSE"

# --- Chrome ---
echo "Building Chrome..."
CHROME_DIR=$(mktemp -d)
for f in $SHARED; do cp -r "$DIR/$f" "$CHROME_DIR/"; done
cp "$DIR/manifest.json" "$CHROME_DIR/"
cd "$CHROME_DIR" && zip -r "$OUT/ai-translate-chrome.zip" . -q
rm -rf "$CHROME_DIR"

# --- Firefox ---
echo "Building Firefox..."
FF_DIR=$(mktemp -d)
for f in $SHARED; do cp -r "$DIR/$f" "$FF_DIR/"; done
cp "$DIR/manifest.json" "$FF_DIR/"

# Patch manifest for Firefox: replace service_worker with scripts
python3 -c "
import json
with open('$FF_DIR/manifest.json', 'r') as f:
    m = json.load(f)
sw = m['background'].pop('service_worker', None)
if sw:
    m['background']['scripts'] = [sw]
with open('$FF_DIR/manifest.json', 'w') as f:
    json.dump(m, f, indent=2)
"

cd "$FF_DIR" && zip -r "$OUT/ai-translate-firefox.zip" . -q
rm -rf "$FF_DIR"

echo "Done!"
echo "  Chrome:  $OUT/ai-translate-chrome.zip"
echo "  Firefox: $OUT/ai-translate-firefox.zip"
