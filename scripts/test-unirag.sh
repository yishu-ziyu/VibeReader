#!/usr/bin/env bash
# UniRAG Python 测试。用法: scripts/test-unirag.sh [pytest 参数...]
# 用 `uv run python -m pytest`（PROJECTS.md 约定：裸 `uv run pytest` 可能命中
# 移动后残留的旧脚本）。默认跑 unit + integration。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/services/uni-rag"

if [ $# -gt 0 ]; then
    exec uv run python -m pytest "$@"
fi

exec uv run python -m pytest tests/unit tests/integration -q
