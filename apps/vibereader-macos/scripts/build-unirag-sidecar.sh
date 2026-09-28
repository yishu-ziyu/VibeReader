#!/bin/zsh
# Builds the UniRAG Python sidecar into an already-assembled VibeReader.app.
#
# Usage: scripts/build-unirag-sidecar.sh <path to VibeReader.app>
#
# Result: VibeReader.app/Contents/Resources/uni-rag/runtime — a relocatable
# CPython with uni-rag and all deps installed. The app launcher prefers this
# over `uv run`, so end users need no Python toolchain.
#
# Model weights (~6G) are deliberately NOT bundled: the service downloads
# them into ~/Library/Application Support/VibeReader/unirag-models on first
# use (HF_HOME is set by the launcher).
#
# Run this after `xcodebuild` export and BEFORE notarization, then re-sign
# the app. For Developer ID distribution every Mach-O in the runtime must be
# signed with your identity; the ad-hoc pass below only covers local testing.
set -euo pipefail

APP="${1:?usage: build-unirag-sidecar.sh <path to VibeReader.app>}"
[ -d "$APP" ] || { echo "error: no app at $APP" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
UNI_RAG="$REPO_ROOT/services/uni-rag"
STAGE="$APP/Contents/Resources/uni-rag"
PYVER="3.13"

command -v uv >/dev/null || { echo "error: uv is required to build the sidecar (dev-machine only)" >&2; exit 1; }
[ -d "$UNI_RAG" ] || { echo "error: UniRAG project not found at $UNI_RAG" >&2; exit 1; }

# Relocatable interpreter: copy uv's python-build-standalone distribution, then
# make a --relocatable venv from it. A plain venv pins absolute paths and would
# break when the .app moves (DerivedData → /Applications); --relocatable keeps
# them relative to the bundle.
uv python install "$PYVER" >/dev/null 2>&1 || true
PY_BIN=$(uv python find "$PYVER")
PY_HOME="$(dirname "$(dirname "$PY_BIN")")"
[ -x "$PY_HOME/bin/python3" ] || { echo "error: unexpected uv python layout at $PY_HOME" >&2; exit 1; }

rm -rf "$STAGE"
mkdir -p "$STAGE"
ditto "$PY_HOME" "$STAGE/python"
chmod -R u+w "$STAGE/python"

# $STAGE/runtime is the relocatable venv the launcher actually execs.
uv venv --relocatable --python "$STAGE/python/bin/python3" "$STAGE/runtime"
# uv leaves bin/python as an ABSOLUTE symlink to the base interpreter; once the
# .app is dragged to /Applications (or DerivedData is cleaned) that link breaks.
# Repoint it at the base python inside the bundle with a relative link.
ln -sf ../../python/bin/python3 "$STAGE/runtime/bin/python"
# Install uni-rag + deps into the venv's site-packages.
uv pip install --python "$STAGE/runtime/bin/python3" "$UNI_RAG"

# Smoke test: the entry module and the heavy deps must import cleanly.
"$STAGE/runtime/bin/python3" -c "import uni_rag.server, sentence_transformers, chromadb"

# Ad-hoc sign the staged binaries (Apple Silicon refuses to run unsigned
# Mach-O copied into a bundle). Replace `-` with your identity for release.
find "$STAGE" -type f \( -name "*.so" -o -name "*.dylib" \) -print0 |
  xargs -0 -n 50 codesign --force --sign - 2>/dev/null || true
codesign --force --sign - "$STAGE/runtime/bin/"python3* "$STAGE/python/bin/"python3* 2>/dev/null || true

echo "Sidecar: $STAGE/runtime ($(du -sh "$STAGE/runtime" | cut -f1 | tr -d ' '))"
