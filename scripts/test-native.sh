#!/usr/bin/env bash
# 原生单元测试（PageFlowTests，app-hosted XCTest）。
# 用法: scripts/test-native.sh [--ui]
#   默认走 PageFlowUnitTests scheme（只构建/运行单元测试，不拉起 UI 测试设施）。
#   --ui 用 PageFlow scheme 全量跑（含 PageFlowUITests，需要本机 GUI 会话）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/apps/vibereader-macos/PageFlow.xcodeproj"

SIGN_ARGS=()
if [ "${VIBEREADER_SIGN:-adhoc}" != "auto" ]; then
    SIGN_ARGS=(CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER=)
fi

if [ "${1:-}" = "--ui" ]; then
    exec xcodebuild test -project "$PROJECT" -scheme "PageFlow" \
        -destination "platform=macOS" "${SIGN_ARGS[@]}"
fi

exec xcodebuild test -project "$PROJECT" -scheme "PageFlowUnitTests" \
    -destination "platform=macOS" -parallel-testing-enabled NO "${SIGN_ARGS[@]}"
