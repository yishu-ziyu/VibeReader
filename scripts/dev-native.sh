#!/usr/bin/env bash
# 开发入口：构建（Debug）并启动原生 VibeReader。
# 用法: scripts/dev-native.sh [--no-build]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/apps/vibereader-macos/PageFlow.xcodeproj"
SCHEME="PageFlow"
CONFIG="${VIBEREADER_CONFIG:-Debug}"

if [ "${1:-}" != "--no-build" ]; then
    echo "== 构建 VibeReader ($SCHEME / $CONFIG) =="
    "$ROOT/scripts/build-native.sh" "$CONFIG" | tail -5
fi

APP_DIR="$(xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration "$CONFIG" \
    -showBuildSettings 2>/dev/null | awk '/ BUILT_PRODUCTS_DIR =/{print $3; exit}')"
APP="$APP_DIR/VibeReader.app"

if [ ! -d "$APP" ]; then
    echo "未找到构建产物: $APP" >&2
    exit 1
fi

echo "== 启动 $APP =="
exec open -a "$APP"
