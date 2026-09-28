# AGENTS.md — VibeReader for Mac（原生模块）

只记录 native 特有规则；仓库级规则见根 [AGENTS.md](../../AGENTS.md)。

## 修改前先读

- `CONTEXT.md` — 本模块的领域语言（PDF View State / Projector / Ingest /
  TabSession / Citation highlight 等）。术语以它为准，不要另造同义词。
- `docs/adr/` — 架构决策（Projector 是唯一 reconciler、无通用 annotation store、
  page operations 留在 PDFManager 等）。

## 硬规则

1. **禁止未经记录新增 direct PDFView writer。** 现存两个例外
   （control-scroll zoom、search-result navigation）记录在 `CONTEXT.md`
   的 "Direct view writes"；新增必须先在 CONTEXT.md 记录并收窄 Projector 范围。
2. **修改 PDF 行为**（缩放 / 翻页 / 显示模式 / tab 视图状态）→ 运行相关
   PageFlowTests（`scripts/test-native.sh`，至少覆盖 PDFViewStateTests、
   FitEngineTests、PageOperationTests、TabSessionTests）。
3. **修改用户流程**（打开文档 / 问答 / citation 跳转 / 设置）→ 必须执行真实
   App / XCUITest 验收：`scripts/acceptance.sh` 或
   `.agents/skills/vibereader-acceptance/` 的流程。
4. **修改 UniRAG 集成**（Client / ChatManager / ServiceLauncher / 侧栏 UI）→
   同时跑 `scripts/test-unirag.sh`；契约改动需同步
   `packages/shared-contracts/reader-unirag-memory/v1/`。

## 布局速览

```
PageFlow.xcodeproj        schemes: PageFlow（构建/运行/UI 测试）·
                           PageFlowUnitTests（仅单元测试）·
                           PageFlow Direct（直发分发）
PageFlow/                 App 源码（Managers / Views / Models / Utilities）
PageFlowTests/            app-hosted 单元测试（scripts/test-native.sh 即跑）
PageFlowUITests/          XCUITest
scripts/                  sidecar 打包（build-unirag-sidecar.sh）与 DMG（package-dmg.sh）
CONTEXT.md                领域语言表
```

> 注：`xcodebuild test` 需要 IOKit 电源断言权限；若本机出现
> "Failed to prevent system sleep during UI testing"（IOPMAssertionCreateWithName
> 被拒），说明系统 powerd 拒绝用户态断言（重启可恢复），此时单元测试跑不了，
> 以 CI 结果为准。

## 归属与许可

本项目 fork 自 PageFlow（pinchen147/PageFlow，Apache-2.0）。根 `LICENSE` 与
README attribution 必须随任何分发保留（DEC-0008）。
