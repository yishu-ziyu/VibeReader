#!/usr/bin/env bash
# 按改动范围执行最低充分验证（Issue #1 的开发控制面入口）。
#
# 用法:
#   scripts/verify.sh                     # 自动识别范围（工作区 vs HEAD）
#   scripts/verify.sh <scope>             # native | unirag | contract | user-visible | all
#   scripts/verify.sh --base <ref>        # 自动识别时改用提交范围 <ref>..HEAD（含工作区）
#   scripts/verify.sh <scope> --skip-acceptance   # user-visible/all 跳过真实验收
#
# 范围判定（auto）:
#   native        仅 apps/vibereader-macos 变动          → build-native + test-native
#   unirag        仅 services/uni-rag 变动               → test-unirag
#   contract      双侧变动或 packages/shared-contracts   → test-native + test-unirag
#   user-visible  触及用户可见核心链路（原生问答/阅读 UI 或 UniRAG API）
#                                                 → 上述全部 + acceptance.sh
#
# 完成定义（根 AGENTS.md）：用户可见功能不能只以 build / unit test 作为完成证明。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_ACCEPTANCE=0
BASE=""
SCOPE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --skip-acceptance) SKIP_ACCEPTANCE=1 ;;
        --base) BASE="${2:?--base 需要一个 ref}"; shift ;;
        native|unirag|contract|user-visible|all) SCOPE="$1" ;;
        *) echo "未知参数: $1" >&2; exit 2 ;;
    esac
    shift
done

detect_scope() {
    local files
    if [ -n "$BASE" ]; then
        files="$( { git diff --name-only "$BASE"..HEAD; git diff --name-only; git ls-files --others --exclude-standard; } | sort -u )"
    else
        files="$( { git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u )"
    fi
    [ -z "$files" ] && { echo "（无未提交改动，对比最近一次提交）"; files="$(git diff-tree --no-commit-id --name-only -r HEAD)"; }

    local native=0 unirag=0 contracts=0 userpath=0
    while IFS= read -r f; do
        case "$f" in
            apps/vibereader-macos/*) native=1 ;;
            services/uni-rag/*) unirag=1 ;;
            packages/shared-contracts/*) contracts=1 ;;
        esac
        case "$f" in
            apps/vibereader-macos/PageFlow/Views/*|apps/vibereader-macos/PageFlow/Managers/*) userpath=1 ;;
            services/uni-rag/src/uni_rag/api/*|services/uni-rag/src/uni_rag/rag/*) userpath=1 ;;
        esac
    done <<< "$files"

    if [ "$userpath" = 1 ] && { [ "$native" = 1 ] || [ "$unirag" = 1 ]; }; then
        echo "user-visible"
    elif [ "$native" = 1 ] && [ "$unirag" = 1 ] || [ "$contracts" = 1 ]; then
        echo "contract"
    elif [ "$native" = 1 ]; then
        echo "native"
    elif [ "$unirag" = 1 ]; then
        echo "unirag"
    else
        echo "all"
    fi
}

if [ -z "$SCOPE" ]; then
    SCOPE="$(detect_scope)"
    echo "== verify: 自动识别范围 = $SCOPE =="
fi

FAILED=()
run() {
    echo
    echo "----------------------------------------------------------------"
    echo ">> $* "
    echo "----------------------------------------------------------------"
    if "$@"; then
        echo "<< PASS: $*"
    else
        echo "<< FAIL: $*"
        FAILED+=("$*")
    fi
}

case "$SCOPE" in
    native)
        run "$ROOT/scripts/build-native.sh"
        run "$ROOT/scripts/test-native.sh"
        ;;
    unirag)
        run "$ROOT/scripts/test-unirag.sh"
        ;;
    contract)
        run "$ROOT/scripts/build-native.sh"
        run "$ROOT/scripts/test-native.sh"
        run "$ROOT/scripts/test-unirag.sh"
        ;;
    user-visible|all)
        run "$ROOT/scripts/build-native.sh"
        run "$ROOT/scripts/test-native.sh"
        run "$ROOT/scripts/test-unirag.sh"
        if [ "$SKIP_ACCEPTANCE" = 1 ]; then
            echo
            echo ">> 跳过 acceptance.sh（--skip-acceptance）。注意：这不能作为用户可见功能的完成证明。"
        else
            run "$ROOT/scripts/acceptance.sh"
        fi
        ;;
    *) echo "未知范围: $SCOPE" >&2; exit 2 ;;
esac

echo
echo "================================================================"
if [ ${#FAILED[@]} -eq 0 ]; then
    echo "verify [$SCOPE]: 全部通过"
else
    echo "verify [$SCOPE]: ${#FAILED[@]} 项失败:"
    for f in "${FAILED[@]}"; do echo "  - $f"; done
    exit 1
fi
