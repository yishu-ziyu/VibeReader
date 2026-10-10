# VibeReader

VibeReader 的统一产品仓库：原生 macOS 阅读器 + 本地知识后端 UniRAG。

## 当前主线（Canonical）

- **产品主线**：`apps/vibereader-macos` — VibeReader for Mac（SwiftUI + AppKit + PDFKit，
  PageFlow fork + UniRAG 带引用问答）。DEC-0010 起为唯一主力产品，
  DEC-0011 起并入本仓统一追踪。
- **知识后端**：`services/uni-rag` — 本地 RAG 服务（FastAPI，127.0.0.1:8766），
  以 sidecar 形式随 App 分发。
- **共享契约**：`packages/shared-contracts/reader-unirag-memory/v1/`

`apps/reader`（旧 Tauri 版）**已冻结**：仅作参考实现保留，不再新增产品能力（DEC-0010）。

Agent / 新会话请先读 [AGENTS.md](AGENTS.md)。

## 快速进入

```bash
# 构建 + 启动原生 App（Debug）
scripts/dev-native.sh

# 单独起 UniRAG 服务（App 开发时通常不需要，sidecar/dev fallback 会自动拉起）
scripts/dev-unirag.sh

# 状态一览（native + UniRAG + git）
scripts/status.sh
```

验证入口：

```bash
scripts/build-native.sh    # 原生构建
scripts/test-native.sh     # 原生单元测试（PageFlowTests）
scripts/test-unirag.sh     # UniRAG Python 测试
scripts/verify.sh          # 按改动范围执行最低充分验证
scripts/acceptance.sh      # 真实黄金路径验收（真实 PDF + 真实 App + 真实 UniRAG）
```

## 核心文档

- [AGENTS.md](AGENTS.md) — Agent 开发入口（主线 / 冻结线 / 完成定义）
- [项目索引](PROJECTS.md)
- [产品开发计划](docs/PROJECT_DEVELOPMENT_PLAN.md) / [产品愿景](docs/PRODUCT_VISION.md)
- 关键决策：[DEC-0010 原生优先 + sidecar](docs/decisions/DEC-0010-native-first-and-unirag-sidecar.md) ·
  [DEC-0011 原生仓并入单仓](docs/decisions/DEC-0011-native-macos-monorepo-import.md)
- 原生模块上下文：[apps/vibereader-macos/CONTEXT.md](apps/vibereader-macos/CONTEXT.md)
