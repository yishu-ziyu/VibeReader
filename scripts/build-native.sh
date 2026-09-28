#!/usr/bin/env bash
# 原生 App 构建。用法: scripts/build-native.sh [configuration]（默认 Debug）
#
# 本地/CI 构建默认用 ad-hoc 签名（CODE_SIGN_IDENTITY="-"），无需开发证书；
# 正式分发签名仍走 apps/vibereader-macos/scripts/package-dmg.sh。
# 有证书想走自动签名: VIBEREADER_SIGN=auto scripts/build-native.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/apps/vibereader-macos/PageFlow.xcodeproj"
SCHEME="PageFlow"
CONFIG="${1:-${VIBEREADER_CONFIG:-Debug}}"

SIGN_ARGS=()
if [ "${VIBEREADER_SIGN:-adhoc}" != "auto" ]; then
    SIGN_ARGS=(CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER=)
fi

xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration "$CONFIG" \
    -destination "platform=macOS" "${SIGN_ARGS[@]}" build
