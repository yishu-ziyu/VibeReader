---
name: diagnosing-bugs
description: VibeReader 排障流程：复现 → 根因 → 最小修复 → 回归验证。当原生 App 或 UniRAG 报错、崩溃、行为异常、回归时使用。
---

# VibeReader 排障

四步闭环，不跳步：

## 1. 复现（Reproduce）

- 通过**报告的用户路径**复现，不用近似路径替代。
- 原生 App：`scripts/dev-native.sh` 启动真实 App；UniRAG 日志在
  `~/Library/Application Support/VibeReader/` 或 sidecar 启动器写的 log
  （`UniRAGServiceLauncher` 有专门日志文件）。
- UniRAG 单独调试：`scripts/dev-unirag.sh` + `curl 127.0.0.1:8766/api/health`。
- 记录：期望行为 / 实际行为 / 稳定性（必现？偶发？条件？）。

## 2. 根因（Root cause）

- 先定位层：App（Swift）↔ HTTP 契约 ↔ UniRAG（Python）。用最小断面切开：
  curl 直接打 UniRAG 接口可排除 App 侧。
- 原生 PDF 行为回归 → 先读 `apps/vibereader-macos/CONTEXT.md` 对应术语，
  大多数历史 bug 的边界已写在 "Direct view writes" / Ingest / TabSession 节。
- 引用页码/定位错误 → `CitationLocator` + UniRAG chunk 页标注两侧都要查
  （chunk 标注的是文本实际所在页）。
- 禁止症状修补：修复必须能解释为什么会出现该现象。

## 3. 最小修复（Minimal fix）

- 最小 coherent diff；不顺手重构；不改冻结线 `apps/reader`。
- 若涉及 PDFView 写入路径，确认没有引入未记录的 direct writer
  （见原生 AGENTS.md 硬规则 1）。

## 4. 回归验证（Regression verification）

- 用**原始用户路径**重跑一遍确认修复。
- `scripts/verify.sh`（自动按改动范围验证）；用户可见流程加跑
  `scripts/acceptance.sh`。
- 相关单元测试补一条钉住根因的用例（能写纯值类型用例就不写 UI 用例）。
