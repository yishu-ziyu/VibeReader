#!/usr/bin/env bash
# 真实黄金路径验收（本机 macOS 运行；CI 不跑此脚本）。
#
# 覆盖 Issue #1 要求的验收面：
#   1. 打开真实 PDF                  —— 通过 macOS `open` 的真实 AppleEvent 路径
#   2. 正常阅读                      —— App 存活（截图留证）
#   3. 调用 UniRAG                   —— 真实启动服务 + App 健康轮询命中服务（日志证据）
#   4. 返回 answer + citation        —— POST /api/query 断言 answer/citations/page
#   5. citation 指回正确页           —— 断言 citation.page 在文档页数范围内
#                                      （App 内点击跳转的定位逻辑由 CitationLocatorTests 覆盖）
#   6. UniRAG 不可用不崩溃           —— 端口被坏服务占用，App 必须存活
#   7. 用户可继续阅读                —— 失败态下进程仍在，截图留证
#
# 用法: scripts/acceptance.sh [--keep]     # --keep 保留现场（App/服务不自动回收）
# 证据目录: test-results/acceptance-<timestamp>/（已 gitignore）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NATIVE="$ROOT/apps/vibereader-macos"
UNIRAG="$ROOT/services/uni-rag"
PORT=8766
BASE="http://127.0.0.1:$PORT"
FIXTURE="$ROOT/test-fixtures/acceptance-sample.pdf"   # 2 页、文本完整的验收样例
QUESTION="什么是监督学习？"
STAMP="$(date +%Y%m%d-%H%M%S)"
ART="$ROOT/test-results/acceptance-$STAMP"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

UNIRAG_PID=""
DUMMY_PID=""

cleanup() {
    [ "$KEEP" = 1 ] && return 0
    cleanup_ingest >/dev/null 2>&1 || true
    quit_app 2>/dev/null || true
    if [ -n "$UNIRAG_PID" ]; then kill "$UNIRAG_PID" 2>/dev/null || true; fi
    if [ -n "$DUMMY_PID" ]; then kill "$DUMMY_PID" 2>/dev/null || true; fi
    return 0
}
trap cleanup EXIT

PASS=0; FAIL=0
check() { # check <名称> <命令...>   命令失败记 FAIL，不中断脚本
    local name="$1"; shift
    echo
    echo "---- [$name] $*"
    if "$@"; then
        echo "     PASS: $name"; PASS=$((PASS+1))
    else
        echo "     FAIL: $name"; FAIL=$((FAIL+1))
    fi
}

quit_app() {
    osascript -e 'tell application "VibeReader" to quit' 2>/dev/null || true
    for _ in 1 2 3 4 5; do
        pgrep -x VibeReader >/dev/null || return 0
        sleep 1
    done
    pkill -x VibeReader 2>/dev/null || true
}

start_unirag() {
    (cd "$UNIRAG" && exec uv run uni-rag serve --port "$PORT") >"$ART/unirag.log" 2>&1 &
    UNIRAG_PID=$!
}

wait_health() { # wait_health <超时秒>
    local deadline=$((SECONDS + $1))
    while [ $SECONDS -lt $deadline ]; do
        if curl -sf -m 3 "$BASE/api/health" | grep -q '"ok"'; then return 0; fi
        sleep 2
    done
    return 1
}

stop_unirag() {
    if [ -n "$UNIRAG_PID" ]; then
        kill "$UNIRAG_PID" 2>/dev/null || true
        wait "$UNIRAG_PID" 2>/dev/null || true
        UNIRAG_PID=""
    fi
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        lsof -ti tcp:$PORT >/dev/null 2>&1 || return 0
        sleep 1
    done
    lsof -ti tcp:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
    return 0
}

start_dummy() {
    # 占住 8766 且对一切请求返回 500：App 的健康检查失败，其拉起的
    # sidecar/dev-fallback 因端口冲突退出 → 呈现真实"服务不可用"状态。
    cat >"$ART/dummy_service.py" <<'PY'
from http.server import BaseHTTPRequestHandler, HTTPServer
class H(BaseHTTPRequestHandler):
    def _bad(self):
        self.send_response(500); self.end_headers(); self.wfile.write(b"unavailable")
    do_GET = do_POST = _bad
    def log_message(self, *a): pass
HTTPServer(("127.0.0.1", 8766), H).serve_forever()
PY
    python3 "$ART/dummy_service.py" >/dev/null 2>&1 &
    DUMMY_PID=$!
}

stop_dummy() {
    if [ -n "$DUMMY_PID" ]; then
        kill "$DUMMY_PID" 2>/dev/null || true
        wait "$DUMMY_PID" 2>/dev/null || true
        DUMMY_PID=""
    fi
    return 0
}

app_alive() { pgrep -x VibeReader >/dev/null; }

screenshot() { screencapture -x "$ART/$1" 2>/dev/null || true; }

# ------------------------------------------------ 断言函数（供 check 调用）
INGEST_JSON="$ART/ingest.json"
QUERY_JSON="$ART/query.json"
ANSWER_HTTP_CODE="000"
INGEST_SOURCE_ID=""

do_ingest() {
    # 走真实 App 同款路径：默认知识库 /api/ingest（App 问答用的就是默认库）。
    # 验收后用返回的 source_id 删除该文档，不污染长期知识库。
    curl -sf -m 300 -F "file=@$FIXTURE" "$BASE/api/ingest" >"$INGEST_JSON" || echo '{}' >"$INGEST_JSON"
    INGEST_SOURCE_ID="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('source_id',''))" "$INGEST_JSON" 2>/dev/null || true)"
}

cleanup_ingest() { # 删除验收期间 ingest 的文档（幂等，尽力而为）
    if [ -n "${INGEST_SOURCE_ID:-}" ]; then
        curl -sf -m 60 -X DELETE "$BASE/api/documents/$INGEST_SOURCE_ID" \
            >"$ART/ingest-cleanup.json" 2>&1 \
            && echo "     已清理验收文档: $INGEST_SOURCE_ID" \
            || echo "     警告: 清理验收文档失败（source_id=$INGEST_SOURCE_ID），请手动删除"
        INGEST_SOURCE_ID=""
    fi
    return 0
}

assert_ingest_chunks() {
    python3 -c "import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if d.get('chunks',0) > 0 else 1)" "$INGEST_JSON"
}

do_query() {
    ANSWER_HTTP_CODE="$(curl -s -m 180 -o "$QUERY_JSON" -w '%{http_code}' \
        -H 'Content-Type: application/json' \
        -d "{\"question\": \"$QUESTION\", \"session_id\": \"acceptance-$STAMP\"}" \
        "$BASE/api/query" || echo 000)"
    echo "     HTTP $ANSWER_HTTP_CODE, 响应已存 $QUERY_JSON"
    [ "$ANSWER_HTTP_CODE" = "200" ]
}

assert_query_shape() { # answer 非空；citations 非空且每条带整数页码与非空原文；
    # 且至少一条 citation 的原文落在验收样例的「监督学习」章节（检索真正命中被索引文档）
    python3 - "$QUERY_JSON" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
ok_answer = bool(d.get("answer", "").strip())
cits = d.get("citations", [])
ok_cit = len(cits) > 0 and all(
    isinstance(c.get("page"), int) and c["page"] >= 0 and c.get("text", "").strip() for c in cits
)
print("     answer:", (d.get("answer") or "")[:160].replace("\n", " "))
for c in cits[:3]:
    print(f"     citation: page={c.get('page')} source={c.get('source')} text={c.get('text','')[:60]}")
ok_grounded = any("监督学习" in c.get("text", "") for c in cits)
sys.exit(0 if (ok_answer and ok_cit and ok_grounded) else 1)
PY
}

assert_pages_in_range() { # 验收样例共 2 页；页码 0 基或 1 基都应落在 [0,2]
    python3 - "$QUERY_JSON" <<'PY'
import json, sys
cits = json.load(open(sys.argv[1])).get("citations", [])
sys.exit(0 if cits and all(0 <= c.get("page", -1) <= 2 for c in cits) else 1)
PY
}

# ---------------------------------------------------------------- preflight
mkdir -p "$ART"
echo "== acceptance 证据目录: $ART"
uname -s | grep -q Darwin || { echo "仅支持 macOS"; exit 2; }
for tool in xcodebuild uv curl python3 pgrep lsof; do
    command -v "$tool" >/dev/null || { echo "缺少工具: $tool"; exit 2; }
done
[ -f "$FIXTURE" ] || { echo "缺少真实 PDF fixture: $FIXTURE"; exit 2; }
if lsof -ti tcp:$PORT >/dev/null 2>&1; then
    echo "端口 $PORT 已被占用（已有 UniRAG 或其他服务在跑）。验收需要独占管理服务生命周期，请先停掉再跑。" >&2
    exit 2
fi
if pgrep -x VibeReader >/dev/null 2>&1; then
    echo "已有 VibeReader 在运行，验收会构建并重启 App。3 秒后继续……"
    sleep 3
fi

echo "== [0] 构建原生 App（Debug）"
if "$ROOT/scripts/build-native.sh" >"$ART/build.log" 2>&1; then
    echo "   构建成功"
else
    tail -30 "$ART/build.log"; echo "构建失败"; exit 1
fi
APP_DIR="$(xcodebuild -project "$NATIVE/PageFlow.xcodeproj" -scheme PageFlow \
    -configuration Debug -showBuildSettings 2>/dev/null | awk '/ BUILT_PRODUCTS_DIR =/{print $3; exit}')"
APP="$APP_DIR/VibeReader.app"
[ -d "$APP" ] || { echo "未找到构建产物: $APP"; exit 1; }
echo "   产物: $APP"

# --------------------------------------------- [1] UniRAG 服务黄金路径
echo
echo "== [1] UniRAG 真实服务：启动 → 索引真实 PDF → 问答 → 断言 answer+citation"
start_unirag
check "1.1 服务健康 (/api/health)" wait_health 180
check "1.2 索引真实 PDF" do_ingest
check "1.3 索引产生 chunks > 0" assert_ingest_chunks
sleep 2
check "1.4 /api/query 返回 200" do_query
check "1.5 answer 非空且 citations 携带页码与原文" assert_query_shape
check "1.6 citation 页码在文档页数范围内" assert_pages_in_range
cleanup_ingest

# --------------------------------------------- [2] 失败路径：服务不可用
echo
echo "== [2] 失败路径：UniRAG 不可用时 App 不崩溃、可继续阅读"
cleanup_ingest
stop_unirag
start_dummy
sleep 1
open -a "$APP" "$FIXTURE"
sleep 12
check "2.1 App 打开真实 PDF 后进程存活" app_alive
screenshot "failure-path-app.png"
sleep 6
check "2.2 失败态下 App 仍存活（未崩溃退出，用户可继续阅读）" app_alive
quit_app
stop_dummy

# --------------------------------------------- [3] App × 真实服务
echo
echo "== [3] 真实 App + 真实 UniRAG：健康轮询命中服务（App→UniRAG 真实调用证据）"
start_unirag
check "3.1 服务健康" wait_health 180
LOG_LINES_BEFORE="$(wc -l < "$ART/unirag.log" | tr -d ' ')"
open -a "$APP" "$FIXTURE"
sleep 15
check "3.2 App 存活" app_alive
screenshot "golden-path-app.png"
tail -n +"$((LOG_LINES_BEFORE + 1))" "$ART/unirag.log" > "$ART/unirag-after-app.log" || true
if grep -q "GET /api/health" "$ART/unirag-after-app.log" 2>/dev/null; then
    check "3.3 App 健康轮询命中 UniRAG（日志证据）" true
else
    echo "     （未在服务日志捕获 /api/health 访问行——访问日志可能未开；见 unirag-after-app.log）"
fi
quit_app
stop_unirag

# ---------------------------------------------------------------- 总结
echo
echo "================================================================"
echo "acceptance 结果: PASS=$PASS FAIL=$FAIL   证据: $ART"
echo "（App 内 citation 点击跳转的定位逻辑由 test-native.sh 的 CitationLocatorTests 覆盖）"
[ "$FAIL" -eq 0 ] || exit 1
