#!/usr/bin/env bash
# 真实黄金路径验收（本机 macOS 运行；CI 不跑此脚本）。
#
# 覆盖 Issue #1 要求的验收面：
#   1. 打开真实 PDF                  —— 新启动构建出的 App，并核对进程路径
#   2. 正常阅读                      —— App 存活（只截该 App 窗口）
#   3. 调用 UniRAG                   —— 真实启动服务 + App 健康轮询命中服务（日志证据）
#   4. 返回 answer + citation        —— POST /api/query 断言 answer/citations/page
#   5. citation 指回正确页           —— 断言验收文档的 citation.page=1
#                                      （App 内点击与高亮需按验收技能另行核验）
#   6. UniRAG 不可用不崩溃           —— 阅读中断开服务，App 必须存活
#   7. 用户可继续阅读                —— 离线态 PDF 内容仍可见，截图留证
#
# 用法: scripts/acceptance.sh [--keep]     # --keep 保留离线现场（App + 500 服务）
# 证据目录: test-results/acceptance-<timestamp>/（已 gitignore）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NATIVE="$ROOT/apps/vibereader-macos"
UNIRAG="$ROOT/services/uni-rag"
PORT=8766
BASE="http://127.0.0.1:$PORT"
SOURCE_FIXTURE="$ROOT/test-fixtures/acceptance-sample.pdf"   # 2 页、文本完整的验收样例
QUESTION="什么是监督学习？"
STAMP="$(date +%Y%m%d-%H%M%S)"
ART="$ROOT/test-results/acceptance-$STAMP"
FIXTURE="$ART/acceptance-sample.pdf"   # 每轮独立路径，不继承旧阅读位置
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

UNIRAG_PID=""
DUMMY_PID=""
APP_PID=""

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
    app_alive || { APP_PID=""; return 0; }
    kill -TERM "$APP_PID" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
        app_alive || { APP_PID=""; return 0; }
        sleep 1
    done
    app_alive && kill -KILL "$APP_PID" 2>/dev/null || true
    APP_PID=""
}

app_pids() {
    local pid
    for pid in $(pgrep -x VibeReader || true); do
        if [ "$(ps -p "$pid" -o comm= 2>/dev/null)" = "$APP/Contents/MacOS/VibeReader" ]; then
            echo "$pid"
        fi
    done
}

start_app() {
    local before pid
    before="$(app_pids)"
    open -n -a "$APP" "$FIXTURE"
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        for pid in $(app_pids); do
            if ! printf '%s\n' "$before" | grep -qx "$pid"; then
                APP_PID="$pid"
                return 0
            fi
        done
        sleep 1
    done
    echo "未找到新启动的构建版 VibeReader 进程" >&2
    return 1
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
    echo "端口 $PORT 仍被占用；不终止未知进程" >&2
    return 1
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

app_alive() {
    [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null &&
        [ "$(ps -p "$APP_PID" -o comm= 2>/dev/null)" = "$APP/Contents/MacOS/VibeReader" ]
}

screenshot() {
    swift "$ROOT/scripts/acceptance-capture.swift" "$APP_PID" \
        "$(basename "$FIXTURE" .pdf)" "$ART/$1" && [ -s "$ART/$1" ]
}

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
ok_grounded = any(
    c.get("source") == "acceptance-sample.pdf" and "监督学习" in c.get("text", "")
    for c in cits
)
sys.exit(0 if (ok_answer and ok_cit and ok_grounded) else 1)
PY
}

assert_pages_in_range() { # 监督学习在验收样例第 1 页；UniRAG citation 使用 1 基页码
    python3 - "$QUERY_JSON" <<'PY'
import json, sys
cits = [c for c in json.load(open(sys.argv[1])).get("citations", [])
        if c.get("source") == "acceptance-sample.pdf"]
sys.exit(0 if cits and all(c.get("page") == 1 for c in cits) else 1)
PY
}

# ---------------------------------------------------------------- preflight
mkdir -p "$ART"
echo "== acceptance 证据目录: $ART"
uname -s | grep -q Darwin || { echo "仅支持 macOS"; exit 2; }
for tool in xcodebuild uv curl python3 pgrep lsof swift open; do
    command -v "$tool" >/dev/null || { echo "缺少工具: $tool"; exit 2; }
done
[ -f "$SOURCE_FIXTURE" ] || { echo "缺少真实 PDF fixture: $SOURCE_FIXTURE"; exit 2; }
if lsof -ti tcp:$PORT >/dev/null 2>&1; then
    echo "端口 $PORT 已被占用（已有 UniRAG 或其他服务在跑）。验收需要独占管理服务生命周期，请先停掉再跑。" >&2
    exit 2
fi
if pgrep -x VibeReader >/dev/null 2>&1; then
    echo "已有 VibeReader 在运行；验收需要独占 App 以归因健康轮询。请先关闭现有实例。" >&2
    exit 2
fi
cp "$SOURCE_FIXTURE" "$FIXTURE"
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

# --------------------------------------------- [2] App × 真实服务
echo
echo "== [2] 真实 App + 真实 UniRAG：打开 PDF 并验证服务调用"
LOG_LINES_BEFORE="$(wc -l < "$ART/unirag.log" | tr -d ' ')"
start_app
sleep 15
check "2.1 App 打开真实 PDF 后进程存活" app_alive
check "2.2 捕获构建版 App 窗口" screenshot "golden-path-app.png"
tail -n +"$((LOG_LINES_BEFORE + 1))" "$ART/unirag.log" > "$ART/unirag-after-app.log" || true
check "2.3 App 健康轮询命中 UniRAG（日志证据）" grep -q "GET /api/health" "$ART/unirag-after-app.log"
cleanup_ingest

# --------------------------------------------- [3] 阅读中断开服务
echo
echo "== [3] 服务不可用时 App 不崩溃，PDF 仍可阅读"
stop_unirag
start_dummy
sleep 12
check "3.1 失败态下 App 仍存活" app_alive
check "3.2 捕获离线时的 PDF 内容" screenshot "failure-path-app.png"
sleep 6
check "3.3 用户可继续阅读（App 未退出）" app_alive
if [ "$KEEP" = 0 ]; then
    quit_app
    stop_dummy
fi

# ---------------------------------------------------------------- 总结
echo
echo "================================================================"
echo "acceptance 自动化结果: PASS=$PASS FAIL=$FAIL   证据: $ART"
echo "App 内提问、引用点击、高亮与离线提示仍需按 .agents/skills/vibereader-acceptance/SKILL.md 在真实界面核验。"
[ "$FAIL" -eq 0 ] || exit 1
