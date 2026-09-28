#!/usr/bin/env bash
# 仓库状态一览：native 主线 + UniRAG + git。DEC-0010/0011 后的默认视角。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NATIVE="$ROOT/apps/vibereader-macos"
UNIRAG="$ROOT/services/uni-rag"

echo "== VibeReader 单仓（DEC-0005 / DEC-0011）=="
echo "$ROOT"
echo

cd "$ROOT"
echo "-- git status --"
git status --short || true
echo
echo "-- 最近提交 --"
git log -5 --oneline
echo

echo "== Native 主线：apps/vibereader-macos =="
if [ -d "$NATIVE" ]; then
    echo "- 存在（根仓直接追踪，无嵌套 .git）"
    if [ -d "$NATIVE/.git" ]; then
        echo "  ! 检测到嵌套 .git，与 DEC-0011 冲突，请处理"
    fi
    echo "-- 最近一次触及 native 的提交 --"
    git log -3 --oneline -- "$NATIVE" || true
else
    echo "- 缺失！"
fi
echo

echo "== 知识后端：services/uni-rag =="
if [ -d "$UNIRAG" ]; then
    echo "-- 最近一次触及 uni-rag 的提交 --"
    git log -3 --oneline -- "$UNIRAG" || true
else
    echo "- 缺失！"
fi
echo

echo "== UniRAG 服务（127.0.0.1:8766）=="
if curl -sf -m 2 http://127.0.0.1:8766/api/health >/dev/null 2>&1; then
    curl -sf -m 2 http://127.0.0.1:8766/api/health
    echo
else
    echo "- 未运行（App 会自动拉起 sidecar / dev fallback；单独调试用 scripts/dev-unirag.sh）"
fi
echo

echo "== 冻结线 =="
echo "- apps/reader：FROZEN / reference-only（DEC-0010）"
