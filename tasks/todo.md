# VibeReader Standalone 任务跟踪

最后更新：2026-05-23

## 当前决策

- [x] 主战场选择 `/Users/mahaoxuan/Desktop/ai-chat-standalone`
- [x] 放弃把 Zotero fork 作为 Hackathon 主线
- [x] 桌面壳选择 Tauri v2
- [x] Hackathon 格式优先级：PDF + Markdown/Text，EPUB 后置
- [x] 当前基线验证：`npm run build` 通过，有 bundle size warning
- [x] 当前主线运行面命名为 `VibeReader Standalone Dev`，旧 `Vibero.app` 只作为历史表面对照

## Phase 0：保护现场

- [x] 初始化 git，或创建时间戳备份目录
- [x] 创建/更新 `DEVLOG.md`
- [x] 记录当前 webpack build 基线
- [x] 标记当前版本为迁移前基线

验收：

- [x] `git status` 可用，或备份目录存在
- [x] `npm run build` 通过
- [x] `DEVLOG.md` 有 Phase 0 记录

## Phase 1：Tauri v2 壳

- [x] 安装 Tauri v2 依赖
- [x] 迁移 webpack 到 Vite
- [x] 初始化 `src-tauri`
- [x] 配置应用名、bundle id、窗口尺寸、图标
- [x] 添加 scripts：`dev`、`build`、`tauri:dev`、`tauri:build`

验收：

- [x] `npm run dev` 通过
- [x] `npm run build` 通过
- [x] `npm run tauri:dev` 打开桌面窗口

## Phase 2：本地文件打开

- [x] 新增 `src/services/documentService.js`
- [x] 定义统一文档对象
- [x] 新增 `src/store/documentStore.js`
- [x] Tauri 环境接入系统文件选择器
- [x] 浏览器环境保留上传 fallback
- [x] PDF 打开后继续复用 `extractTextFromPDF` 和 `PdfViewer`

验收：

- [x] Tauri 权限包含 dialog + 只读文件读取能力
- [x] 浏览器 dev server 入口可访问
- [x] Tauri dev 窗口可启动
- [x] 文件夹误选会被拦截并提示
- [x] PDF 解析和视觉渲染使用独立二进制副本
- [x] 真实 PDF 文件完成解析
- [x] PDF 视觉渲染成功
- [x] 打开失败有明确错误提示

## Phase 3：阅读器 + AI 双栏工作台

- [x] 新增双栏工作台布局
- [x] 左侧显示文档阅读器
- [x] 右侧显示 AI 面板 Tabs
- [x] 加可拖拽分隔线
- [x] 窄屏/小窗口有降级状态

验收：

- [x] 阅读器和 AI 面板同时可见
- [x] 拖拽不会压坏布局
- [x] 选区注入仍能用

## Phase 4：Stop generating

- [x] BDD/TDD 计划写入 `tasks/bdd-tdd-phase4.md`
- [x] `aiService.chatStream` 支持 `AbortSignal`
- [x] UI 保存当前 `AbortController`
- [x] `ChatInput` loading 时显示停止按钮
- [x] 停止后保留已生成内容

验收：

- [x] 长回复可中断（自动化模拟 AbortError）
- [x] UI 停止 loading（Abort 回调结束 typing/loading）
- [x] 控制台无未捕获异常（构建、测试、PDF QA 未发现新增未捕获异常）
- [x] 真实模型长回复中断手工验收

## Phase 5：Markdown/Text 阅读

- [x] 新增 Markdown 文档阅读器
- [x] 新增 Text 文档阅读器
- [x] HTML 只做安全正文读取，不执行脚本
- [x] 所有文本阅读器支持选区注入

验收：

- [x] `.md` 可打开
- [x] `.txt` 可打开
- [x] `.html` 可安全打开或给出明确提示
- [x] 选区可注入 AI

## Phase 6：PDF 大纲与最小批注

- [x] `pdfDoc.getOutline()` 显示目录
- [x] 点击目录跳转
- [x] 选区创建高亮记录
- [x] 选区创建笔记记录
- [x] 批注保存到本地持久存储

验收：

- [x] 有目录 PDF 可跳转
- [x] 批注列表刷新后仍存在
- [x] 不要求第一版写回 PDF 文件

## Phase 7：演示准备

- [x] 新建 `demo-assets/`
- [x] 准备 PDF/Markdown/Text/HTML 示例文件
- [x] 新建 `docs/DEMO_SCRIPT.md`
- [x] 写 3 分钟和 8 分钟演示脚本
- [x] 按 `docs/ACCEPTANCE_AND_QA.md` 完整验收

验收：

- [x] 3 分钟演示闭环可跑通
- [x] 失败备用路径可执行
- [x] 最终 QA 结果写入 `DEVLOG.md`

## Phase 8：gstack 对齐后的发布硬化

- [x] 新增 `tasks/bdd-tdd-phase8.md`
- [x] MiniMax/AI 生产包通信路径明确并测试（Tauri 原生 HTTP 绕过 CORS）
- [x] 无 API key / 坏 key 用户提示闭环
- [x] 多文档状态隔离验收（App.jsx useEffect + PdfViewer 重置 + documentIsolation 测试）
- [x] Playwright smoke 脚本固化（5 spec 文件 / 20 测试全部通过）
- [x] PDF 批注高亮视觉重绘（rect 坐标存储 + highlightLayer 叠加渲染）
- [x] 包体优化与代码分割（manualChunks + React.lazy，首屏 -80%）
- [ ] gstack pre-landing review 报告
- [ ] Commit/checkpoint 当前 demo-ready 基线

验收：

- [x] `npm run test` 通过（14 files / 48 tests）
- [x] `npm run build` 通过
- [x] `cd src-tauri && cargo check` 通过
- [x] `npx playwright test` 通过（20 tests）
- [ ] Phase 8 结果写入 `DEVLOG.md`

## Review

2026-05-23：已完成本轮规划接力，并完成 Phase 0 版本保护。当前基线提交为 `e6ea59f`。下一步应从 Phase 1：Tauri v2 壳 + Vite 迁移开始。

2026-05-23：继续执行 Phase 1/2。已完成 Vite 迁移、Tauri v2 初始化、dialog/fs 插件、桌面图标、统一文档服务和文档状态 store。`npm run build`、`cargo check`、`npm run tauri:dev` 均通过。剩余需要在真实桌面交互中选择一份 PDF，完成 A3/A4/A5 手工验收。

2026-05-23：根据真实截图和 dev 日志修复 PDF 可视渲染链路：拦截名字以 `.pdf` 结尾的目录，增加 `fs:allow-stat`，并为 pdf.js 文本解析和 Viewer 渲染拆分独立 byte copy。下一次手工验收建议选择 `/Users/mahaoxuan/Desktop/黑客松/Vibero/test/tests/data/wonderland_short.pdf`。

2026-05-23：为避免旧 Zotero fork、旧 `_apps/Vibero.app` 与当前 Tauri dev app 混淆，当前主线命名为 `VibeReader Standalone Dev`，并新增 `PROJECT_MAP.md` 作为路径和验收对象说明。下一步先完成真实 PDF 可视验收，再推进 Phase 3 双栏工作台。

2026-05-23：真实 PDF 验收通过。通过 `http://127.0.0.1:3217/` 灌入 `/Users/mahaoxuan/Desktop/黑客松/Vibero/test/tests/data/wonderland_short.pdf`，页面显示 `PDF 已加载，共 29 页`，文本层包含 Alice in Wonderland 内容，canvas 数量为 1，尺寸 612x792，采样到 613 个非白像素样本。截图保存在 `/tmp/vibereader-pdf-qa.png`。

2026-05-23：Phase 3 双栏工作台已落地。左侧 PDF 阅读器与右侧 AI Tabs 同屏显示，拖拽分隔线将阅读器宽度从 666.8px 调整到 551px，右侧 AI 面板同步扩展到 589px；窄屏 820px 验证为上下堆叠且无横向溢出。桌面截图 `/tmp/vibereader-dual-pane-qa.png`，窄屏截图 `/tmp/vibereader-dual-pane-narrow-qa.png`。剩余需手工验证 PDF 选区注入。

2026-05-23：Phase 4 Stop generating 已按 BDD/TDD 推进。新增 Vitest + Testing Library 测试底座，先观察到 `AbortSignal` 未传递、AbortError 会变成硬失败、loading 状态下没有 Stop 控件的红灯失败，再完成最小实现并转绿。真实 PDF 选区注入通过 CDP 验收：`wonderland_short.pdf` 加载 29 页，canvas 612x792 非空，文本层包含 Alice/Project Gutenberg，选中 `Project` 后右侧 Chat 出现 `基于以下论文内容： Project`，阅读器与 AI 面板仍同时可见。截图 `/tmp/vibereader-phase4-qa.png`。由于当前模型请求返回 `Failed to fetch`，真实模型长回复中断仍需用有效 API 配置手工验收。

2026-05-23：已把可用的 MiniMax Token Plan 配置迁回当前 Tauri 主线 `VibeReader Standalone Dev` 的 WebKit localStorage。来源为本机 `~/.mmx/config.json`，写入目标为 `~/Library/WebKit/vibereader/.../LocalStorage/localstorage.sqlite3`，写入前已生成 `.bak-20260523160540` 备份。回读确认选中配置为 `vibereader-minimax-token-plan`，模型为 `MiniMax-M2.7`，协议为 Anthropic 兼容，API key 存在但未写入 git 或文档。旧 Codex 备份里的另一枚 MiniMax key 已验证为 `401 invalid api key`，未迁入。Kimi/Moonshot 只找到旧网页运行面的 `trial-kimi-priority` 标记，未找到可复用的真实 Moonshot API key，因此未创建不可用的 Kimi 配置。

2026-05-23：Phase 5 Markdown/Text/HTML 通用阅读已按 BDD/TDD 完成。新增 `DocumentReader`、HTML 安全正文提取、浏览器/Tauri 非 PDF 文档读取链路，并把 `.md/.markdown/.txt/.html/.htm` 接入现有“左读右问”工作台。定向红灯先失败于缺少 `DocumentReader`、`fileToDocumentWithContent`、`sanitizeHtmlToText`；实现后 `npm run test` 通过 4 个测试文件 / 9 个测试，`npm run build` 通过且仅保留既有 chunk size warning。CDP 浏览器验收已灌入 `/tmp/vibereader-phase5/sample.md`、`sample.txt`、`sample.html`：Markdown/Text/HTML 均可见，HTML script/style 不显示且脚本未执行，Markdown 选区注入后右侧 Chat 出现 document context 消息。截图 `/tmp/vibereader-phase5-qa.png`。

2026-05-23：Phase 6 PDF 大纲与最小批注已按 BDD/TDD 完成。新增 `annotationService`、`PdfAnnotationToolbar`、`pdfOutline`，并接入 `PdfViewer`。红灯覆盖缺少批注服务、批注工具栏、大纲解析；绿灯后 `npm run test` 通过 7 个测试文件 / 15 个测试，`npm run build` 通过，`cargo check` 通过。真实浏览器验收使用 `/tmp/vibereader-phase6-outline.pdf`：pdf.js 读出 Introduction / Methods / Findings 三个大纲项，点击 Methods 跳转到第 2 页；选中第 2 页文本后保存高亮和 `QA note` 笔记，`localStorage.vibereader.annotations` 记录 2 条批注，批注列表显示 P2、高亮文本和笔记。截图 `/tmp/vibereader-phase6-qa.png`。第一版批注不写回 PDF 文件。

2026-05-23：Phase 7 演示闭环已完成。新增 `demo-assets/`，包含 `outline-demo.pdf`、`wonderland_short.pdf`、`sample.md`、`sample.txt`、`sample.html`、`demo-fallback-answer.md`；新增 `docs/DEMO_SCRIPT.md` 和 `tasks/bdd-tdd-phase7.md`。PDF worker 改为 Vite/Tauri 本地打包资产，构建产物包含 `dist/assets/pdf.worker.min-*.mjs`，不再依赖 CDN。MiniMax 在本地 dev 运行面新增同源 `/api/minimax` 代理，解决浏览器 CORS 预检失败。最终验收：`npm run test` 通过 11 个测试文件 / 23 个测试，`npm run build` 通过，`cargo check` 通过，`npx tauri dev --no-watch --config '{"build":{"beforeDevCommand":""}}'` 成功启动 `target/debug/vibereader`。Playwright 真实闭环使用 demo 资产完成 PDF 大纲跳转、批注、Markdown 选区注入、MiniMax 长回复 Stop，控制台无错误，截图 `/tmp/vibereader-phase7-qa.png`。

2026-05-23：根据 `/Users/mahaoxuan/gstack` 规范完成 VibeReader 项目治理对齐。新增 `docs/GSTACK_ALIGNMENT.md`、`tasks/gstack-backlog.md`、`tasks/bdd-tdd-phase8.md` 和 `docs/superpowers/plans/2026-05-23-vibereader-gstack-roadmap.md`。当前下一阶段是 Phase 8 发布硬化：优先处理生产包 AI 通信路径、无 key/坏 key UX、多文档隔离、Playwright smoke 固化和 gstack pre-landing review。

2026-05-23：Phase 8 开始执行。已新增 `src/modelConfigGuard.js` 和 `src/modelConfigGuard.test.js`，发送前拦截缺少配置、缺少 API key、缺少 base URL、缺少模型名四类问题，不进入 loading，也不泄露 key。已新增 `scripts/qa-smoke.mjs` 和 `npm run qa:smoke`，无密钥时输出 `SKIPPED_LIVE_AI`，Playwright 未安装时给出明确依赖错误。
