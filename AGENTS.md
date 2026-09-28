# AGENTS.md — VibeReader 开发入口

新会话 / 新 Agent 从这里开始。项目详细索引见 [PROJECTS.md](PROJECTS.md)。

## 产品主线（canonical product）

```
apps/vibereader-macos
```

原生 macOS 阅读器（SwiftUI + AppKit + PDFKit，PageFlow fork + UniRAG 带引用问答）。
DEC-0010 起为唯一主力产品。修改原生代码前先读 `apps/vibereader-macos/AGENTS.md`
与 `apps/vibereader-macos/CONTEXT.md`。

## 冻结线（frozen）

```
apps/reader
```

旧 Tauri 版，仅作 AI 功能参考实现。规则：

- 可查阅旧实现；
- **默认禁止新增产品功能**；
- 若任务明确授权修改，须在提交说明中引用该授权。

## 知识后端

```
services/uni-rag
```

本地 RAG（FastAPI，127.0.0.1:8766，sidecar 分发）。跨端契约：
`packages/shared-contracts/reader-unirag-memory/v1/`，由
`services/uni-rag/tests/integration/test_contract_v1.py` 钉死。

## 开发控制面（scripts/）

| 场景 | 命令 |
| --- | --- |
| 开发运行 | `scripts/dev-native.sh`（构建+启动 App）· `scripts/dev-unirag.sh` |
| 构建/测试 | `scripts/build-native.sh` · `scripts/test-native.sh` · `scripts/test-unirag.sh` |
| 提交前 | `scripts/verify.sh`（按改动范围自动选择最低充分验证） |
| 完成证明 | `scripts/acceptance.sh`（真实黄金路径验收，仅本机 macOS） |

## 完成定义（Definition of Done）

**用户可见功能不能只以 build / unit test 作为完成证明。** 默认验证链：

```
Intent（意图）
→ Action（改动）
→ Real-world Effect（真实效果：真实 App + 真实服务）
→ Observation（观察：日志 / 截图 / 返回值）
→ Goal Verification（对照意图核验）
→ Recovery（失败路径：服务不可用 / 边界输入不崩溃）
```

- 改动用户可见核心链路（阅读 / 问答 / citation 跳转）→ 必须跑
  `scripts/acceptance.sh`（真实验收技能见 `.agents/skills/vibereader-acceptance/`）。
- "测试通过" ≠ "用户目标完成"；以真实用户路径的可见结果为准。

## 约定

- UniRAG Python 测试统一 `uv run python -m pytest ...`（裸 `uv run pytest` 会命中旧脚本）。
- 原生术语（PDF View State / Projector / Ingest / TabSession 等）以
  `apps/vibereader-macos/CONTEXT.md` 为准。
- 持久决策写入 `docs/decisions/`（DEC-xxxx），不留在聊天记录里。
- 提交信息：`<type>: <description>`（feat / fix / refactor / docs / test / chore / perf / ci）。
- 项目级 skills 在 `.agents/skills/`（少而深：diagnosing-bugs / code-review /
  vibereader-acceptance），不引入重型 Agent 框架。
