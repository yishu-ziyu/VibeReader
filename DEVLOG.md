# Vibero Standalone 开发日志

## 2026-05-23 规划接力

背景：

- 前一轮 Antigravity CLI 在写 Codex 计划时多次中断。
- 本轮已重新确认本地代码状态，并将计划拆成多个稳定文件落盘。

已确认：

- 主开发目录是 `/Users/mahaoxuan/Desktop/ai-chat-standalone`。
- 旧 Zotero fork `/Users/mahaoxuan/Desktop/黑客松/Vibero` 不再作为主线。
- 当前目录不是 git 仓库。
- `npm run build` 已通过。
- 构建警告：主 bundle 约 2.43 MiB，webpack 提示体积过大。

新增文档：

- `docs/CODEX_IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_AND_QA.md`
- `docs/CODEX_HANDOFF_PROMPT.md`
- `tasks/todo.md`

下一步：

1. 从 Tauri v2 + Vite 迁移开始。
2. 每完成一个阶段更新本日志和 `tasks/todo.md`。

## 2026-05-23 Phase 0 验收

改动：

- 新增 `.gitignore`，排除 `node_modules/`、`dist/`、`src-tauri/target/`、本地环境文件和编辑器状态。
- 在 `/Users/mahaoxuan/Desktop/ai-chat-standalone` 初始化 git。
- 创建本地基线提交 `e6ea59f`。

命令：

- `npm run build` -> pass，webpack 编译成功，有 bundle size warning。
- `git status` -> 可用。

遗留风险：

- Tauri runtime 尚未初始化。
- 当前仍是 webpack 构建，Phase 1 需要迁移到 Vite。

## 2026-05-23 Phase 1/2 执行

改动：

- 将前端构建从 webpack 迁移到 Vite。
- 初始化 Tauri v2：应用名 `Vibero`，bundle id `cn.yishuziyu.vibero`，窗口尺寸 `1280x820`，最小尺寸 `960x640`。
- 添加 Tauri dialog/fs 插件，并生成 Tauri 图标资源。
- 新增 `src/services/documentService.js`，统一识别 PDF/Markdown/HTML/Text 文档，并在 Tauri 环境打开系统文件选择器。
- 新增 `src/store/documentStore.js`，记录当前文档、文档列表和 active document id。
- 更新 `src/App.jsx`：侧边栏文件入口优先使用 Tauri 文件选择器，浏览器环境回退到隐藏文件 input；PDF 解析成功后结束 parsing 状态并切到 PDF 面板。
- 更新 Tauri capability：保留 `fs:default`，追加 `fs:allow-read-file` 和 `fs:allow-read-text-file`。

命令：

- `npm run build` -> pass，Vite 构建成功，仍有单 chunk 大于 500 kB 的体积警告。
- `cd src-tauri && cargo check` -> pass。
- `npm run tauri:dev` -> pass，桌面应用进程 `target/debug/vibero` 成功启动。
- `npm run tauri -- info` -> pass，Tauri 2.11.2 / Vite / React 识别正常；提示未安装完整 Xcode 和 rustup。
- `npm run dev` + `curl -fsS http://127.0.0.1:3000/` -> pass，Vite dev entry 可访问。

手工验收：

- A1 Web 构建：pass。
- A2 Tauri 启动：pass。
- A3 本地 PDF 打开：代码链路已接入，真实文件选择与解析还需要在桌面窗口中手工跑一遍。
- A4 PDF 翻页缩放：未在本轮手工验证。
- A5 选区注入 AI：未在本轮手工验证。

遗留风险：

- PDF.js worker 仍来自 CDN，离线打开 PDF 不是稳定保证。
- 主前端 bundle 约 2.27 MB，后续需要 code splitting。
- Tauri 环境可用 Homebrew Rust 构建，但 `tauri info` 提示更推荐 rustup；打包发布前应补齐正式 macOS 工具链检查。

## 2026-05-23 Phase 2 PDF 可视渲染修复

问题：

- 真实手工打开文件时，曾选择到一个名字以 `.pdf` 结尾的目录：`/Users/mahaoxuan/Downloads/故事》罗伯特麦基-著 21.55.20.pdf`。
- 旧逻辑只看扩展名，可能把目录当成 PDF 或文本文件继续读取。
- PDF 文本解析成功后，视觉阅读器出现空白页风险；原因是 `pdfService` 把同一份二进制传给文本解析和 `PdfViewer` 复用，pdf.js 可能消费/转移该 buffer。

改动：

- `documentService` 规范化 Tauri dialog 返回值，并用 `stat(path)` 判断是否为目录。
- Tauri capability 新增 `fs:allow-stat`。
- `pdfService` 为文本解析和视觉阅读器分别创建独立 `Uint8Array` 副本。
- `PdfViewer` 在加载 PDF 时再次复制传入数据，避免后续渲染拿到被消费的 buffer。

命令：

- `npm run build` -> pass。
- `cd src-tauri && cargo check` -> pass。
- `npm run tauri:dev` -> pass，桌面应用重新启动成功。

手工验收建议：

- 不要选择名字以 `.pdf` 结尾的目录。
- 使用真实文件，例如 `/Users/mahaoxuan/Desktop/黑客松/Vibero/test/tests/data/wonderland_short.pdf`。

## 2026-05-23 运行面去混淆

背景：

- 用户指出旧 Hackathon 目录、旧 `_apps/Vibero.app` 和当前独立开发目录容易混淆。
- 当前后续开发主线应明确锁定 `/Users/mahaoxuan/Desktop/ai-chat-standalone`。

改动：

- 当前 Tauri 开发版窗口标题改为 `VibeReader Standalone Dev`。
- Tauri product name 改为 `VibeReader`，bundle identifier 改为 `cn.yishuziyu.vibereader`。
- Rust package / debug binary 改为 `vibereader`，避免进程名继续显示为旧 `vibero`。
- NPM package name 改为 `vibereader-desktop`。
- Vite/Tauri dev server 固定到 `http://127.0.0.1:3217`，避免误连其他项目占用的 3000 端口。
- 侧边栏标题改为 `VibeReader Dev`。
- 新增 `PROJECT_MAP.md`，记录当前主线、历史表面和 PDF 验收目标。

下一步：

1. 运行 `npm run build`、`cd src-tauri && cargo check`、`npm run tauri -- info`。
2. 启动 `npm run tauri:dev`，确认窗口和进程均为 VibeReader。
3. 使用真实 PDF 文件完成视觉渲染验收后，再进入 Phase 3 双栏工作台。

## 2026-05-23 真实 PDF 可视验收

验收文件：

- `/Users/mahaoxuan/Desktop/黑客松/Vibero/test/tests/data/wonderland_short.pdf`

结果：

- 页面标题为 `VibeReader Standalone Dev`。
- PDF 状态显示 `PDF 已加载，共 29 页`。
- 文本层包含 `Alice in Wonderland` / `Project Gutenberg` 内容。
- 页面存在 1 个 PDF canvas，尺寸为 612x792。
- canvas 像素采样到 613 个非白样本，确认不是空白页。
- 控制台未采集到相关 error/warn。
- 截图保存在 `/tmp/vibereader-pdf-qa.png`。

结论：

- Phase 2 PDF 解析与可视渲染验收通过。
- 可以进入 Phase 3 双栏工作台改造。

## 2026-05-23 Phase 3 双栏工作台

改动：

- 主内容区改为左侧 PDF 阅读器、右侧 AI 工具区的双栏工作台。
- 右侧 AI 工具区保留 Chat / Summary / Flashcard / MindMap Tabs。
- 新增可拖拽分隔线，宽度比例持久化到 `uiStore`。
- 小窗口下切换为上下堆叠，避免横向挤压。
- PDF 上传后保持右侧 Chat，不再把主内容区互斥切到 PDF Tab。

验收：

- `npm run build` -> pass，仍有既有 bundle size warning。
- 真实 PDF 加载后，左侧阅读器与右侧 AI 面板同时可见。
- 拖拽分隔线后，阅读器宽度从 666.8px 调整到 551px，右侧 AI 面板扩展到 589px。
- PDF canvas 仍为 612x792，采样到 613 个非白像素样本。
- 820px 窄屏下自动上下堆叠，无横向溢出。
- 截图：`/tmp/vibereader-dual-pane-qa.png`、`/tmp/vibereader-dual-pane-narrow-qa.png`。

遗留风险：

- PDF 选区注入仍需在真实鼠标选中文本场景中手工验收。

## 2026-05-23 Phase 4 Stop generating + PDF 选区注入验收

BDD/TDD：

- 新增 `tasks/bdd-tdd-phase4.md`，固定 Stop generating 与 PDF 选区注入的 Given / When / Then 行为。
- 新增 Vitest + Testing Library 测试底座。
- 红灯结果：`aiService.chatStream` 未向 `fetch` 传入 `AbortSignal`；AbortError 会抛出并丢失 partial 内容；loading 状态下 `ChatInput` 没有 Stop 控件。
- 绿灯结果：`npm run test` 通过，2 个测试文件共 3 个测试通过。

改动：

- `aiService.chatStream` 支持 `options.signal`，AbortError 返回 `{ interrupted: true, aborted: true, fullMessage }`，不再抛成硬失败。
- `App` 为每次发送创建独立 `AbortController`，Stop 只取消当前请求。
- `ChatInput` 的发送按钮拆成 `ChatSubmitControl`，loading 时显示 Stop。

验收：

- `npm run test` -> pass。
- `npm run build` -> pass，仍有既有 bundle size warning。
- `cd src-tauri && cargo check` -> pass。
- 真实 PDF 选区注入：通过 CDP 在 `wonderland_short.pdf` 中选中 `Project` 并点击注入，右侧 Chat 出现 `基于以下论文内容： Project`，左侧阅读器仍可见，截图 `/tmp/vibereader-phase4-qa.png`。

遗留风险：

- 当前模型请求在本机返回 `Failed to fetch`，真实长回复 Stop 需要使用有效 API 配置做一次手工验收。

## 2026-05-23 模型配置迁移

结果：

- 当前 Tauri 主线 `VibeReader Standalone Dev` 的 WebKit localStorage 已写入可用 MiniMax Token Plan 配置。
- 写入目标：`~/Library/WebKit/vibereader/.../LocalStorage/localstorage.sqlite3`。
- 写入前备份：`localstorage.sqlite3.bak-20260523160540`。
- 选中配置：`vibereader-minimax-token-plan`。
- 模型：`MiniMax-M2.7`。
- Base URL：`https://api.minimaxi.com/anthropic`。
- 协议：Anthropic 兼容。

验证：

- 回读 localStorage 确认 `ai-chat.modelConfigs` 包含 MiniMax 配置，`ai-chat.selectedConfigId` 指向该配置。
- 使用同一 key 直接请求 `https://api.minimaxi.com/anthropic/v1/messages`，`MiniMax-M2.7` 返回 HTTP 200。
- 旧 Codex 备份中的另一枚 MiniMax key 返回 HTTP 401，未迁入。
- `npx vitest run --environment jsdom --pool=threads --testTimeout=30000` -> pass，2 个测试文件 / 3 个测试通过。
- `npm run build` -> pass，仍有既有 chunk size warning。
- `cd src-tauri && cargo check` -> pass。

遗留风险：

- 未找到可复用的 Kimi/Moonshot API key；旧网页运行面只有 `trial-kimi-priority` 标记，不是当前 VibeReader 可直接调用的 API 配置。
- 如果迁移时 VibeReader 窗口已经打开，WebKit 可能仍持有旧 localStorage 缓存；重启 VibeReader 后会读取已写入的配置。

## 2026-05-23 Phase 5 Markdown/Text/HTML 通用阅读

BDD/TDD：

- 新增 `tasks/bdd-tdd-phase5.md`，固定 Markdown、Text、HTML 安全读取和选区注入四个行为。
- 红灯结果：缺少 `DocumentReader`、`fileToDocumentWithContent`、`sanitizeHtmlToText`。
- 绿灯结果：`npm run test -- src/services/documentService.test.js src/DocumentReader.test.jsx` 通过，2 个测试文件共 6 个测试通过。

改动：

- 新增 `src/DocumentReader.jsx`，用于 Markdown/Text/HTML 文档阅读。
- `src/services/documentService.js` 增加非 PDF 文档读取和 HTML 安全正文提取。
- `src/App.jsx` 的打开文件入口从 PDF-only 升级为 PDF + Markdown + Text + HTML，并保留 PDF 原链路。
- `src/styles.css` 增加通用文档阅读器样式。

验收：

- `npm run test` -> pass，4 个测试文件共 9 个测试通过。
- `npm run build` -> pass，仍有既有 chunk size warning。
- 通过 CDP 在 `http://127.0.0.1:3217/` 灌入 `/tmp/vibereader-phase5/sample.md`、`sample.txt`、`sample.html`。
- Markdown/Text/HTML 均在左侧阅读器显示。
- HTML 验收结果：标题和正文可见，script/style 文本不可见，`window.__vibereader_hacked` 未被设置。
- Markdown 选区注入后右侧 Chat 出现 document context 用户消息。
- 截图：`/tmp/vibereader-phase5-qa.png`。

遗留风险：

- Summary/Flashcard/MindMap 仍复用 `pdfStore.pdfText` 命名，行为可用但命名已经不准确；Phase 6/7 前建议重命名为通用 `documentText`。

## 2026-05-23 Phase 6 PDF 大纲与最小批注

BDD/TDD：

- 新增 `tasks/bdd-tdd-phase6.md`，固定 PDF 大纲、无大纲降级、高亮、笔记、批注持久化五个行为。
- 第一轮红灯：缺少 `annotationService`。
- 第二轮红灯：缺少 `PdfAnnotationToolbar`。
- 第三轮红灯：缺少 `pdfOutline`。
- 绿灯结果：`npm run test` 通过，7 个测试文件共 15 个测试通过。

改动：

- 新增 `src/services/annotationService.js`，提供本地批注创建、读取、清理接口。
- 新增 `src/PdfAnnotationToolbar.jsx`，把 PDF 选区操作扩展为“注入 AI / 高亮 / 保存笔记”。
- 新增 `src/pdfOutline.js`，处理 PDF outline 扁平化和 destination 到页码的解析。
- `src/PdfViewer.jsx` 接入大纲条、点击跳页、批注保存和批注列表。
- `src/App.jsx` 将当前 PDF 文档 ID 传给 `PdfViewer`，用于批注归属。

验收：

- `npm run test` -> pass，7 个测试文件 / 15 个测试。
- `npm run build` -> pass，仍有既有 chunk size warning。
- `cd src-tauri && cargo check` -> pass。
- 使用 ReportLab 在 `/tmp/vibereader-phase6-outline.pdf` 生成 3 页带书签 PDF，并用 pdf.js 确认 outline 标题为 Introduction / Methods / Findings。
- CDP 浏览器验收：上传该 PDF 后大纲显示，点击 Methods 后页码输入框变为 2。
- 在第 2 页文本层选中 `This is page 2...` 后，保存高亮和 `QA note` 笔记。
- 回读 `localStorage.vibereader.annotations`：2 条批注，包含 page=2 的 yellow highlight 和 note=`QA note`。
- 截图：`/tmp/vibereader-phase6-qa.png`。

遗留风险：

- 批注第一版只持久化到本地存储并在列表中展示，不写回 PDF，也不在 canvas/text layer 上复原高亮 overlay。
- 批注服务当前用 localStorage，适合 hackathon MVP；如果批注规模变大，应迁移到 IndexedDB object store。

## 2026-05-23 Phase 7 演示闭环与最终 QA

BDD/TDD：

- 新增 `tasks/bdd-tdd-phase7.md`，固定演示资产自包含、本地 PDF worker、3 分钟/8 分钟演示脚本和失败备用路径。
- 红灯结果：演示资产测试缺少稳定仓库内文件；PDF worker 测试暴露旧配置依赖 CDN；真实 Playwright 验收暴露 PDF 笔记输入会触发 `selectionchange` 清掉工具栏。
- 绿灯结果：`npm run test` 通过，11 个测试文件共 23 个测试通过。

改动：

- 新增 `demo-assets/`，包含 `outline-demo.pdf`、`wonderland_short.pdf`、`sample.md`、`sample.txt`、`sample.html`、`demo-fallback-answer.md` 和说明文件。
- 新增 `docs/DEMO_SCRIPT.md`，覆盖 3 分钟脚本、8 分钟脚本、AI API 失败备用路径和验收清单。
- 新增 `src/pdfWorker.js`，让 `pdfService` 与 `PdfViewer` 使用 Vite/Tauri 本地打包的 `pdf.worker.min.mjs`，构建产物已包含 `dist/assets/pdf.worker.min-*.mjs`。
- 新增 `src/aiEndpoint.js` 与 Vite `/api/minimax` dev proxy，本地开发环境把 MiniMax Anthropic 兼容请求改走同源代理，避免浏览器 CORS 预检失败。
- 新增 `src/pdfSelection.js`，修复焦点进入 PDF 批注工具栏时选区被清空、导致笔记按钮消失的问题。

验收：

- `npm run test` -> pass，11 个测试文件 / 23 个测试。
- `npm run build` -> pass，仍有既有 chunk size warning；本地 PDF worker 已进入 `dist/assets/`。
- `cd src-tauri && cargo check` -> pass。
- `npx tauri dev --no-watch --config '{"build":{"beforeDevCommand":""}}'` -> pass，`target/debug/vibereader` 成功启动；验证后已手动停止。
- Playwright 真实闭环：在 `http://127.0.0.1:3217/` 打开应用，上传 `demo-assets/outline-demo.pdf`，大纲显示 Introduction / Methods / Findings，点击 Methods 后页码为 2。
- PDF 批注验收：第 2 页保存高亮和 `Phase 7 QA note` 笔记，`localStorage.vibereader.annotations` 为 2 条，批注列表显示 P2 和笔记。
- Markdown 验收：上传 `demo-assets/sample.md`，选中 `The important design decision...` 段落并注入 AI，右侧 Chat 收到文档上下文。
- AI/Stop 验收：Playwright 从本机 `~/.mmx/config.json` 临时注入 MiniMax Token Plan 配置，发送长回复请求后点击 Stop，loading 恢复为 Send，页面无 `Failed to fetch` / `login fail`，控制台错误列表为空。API key 未写入 git 或文档。
- 最终截图：`/tmp/vibereader-phase7-qa.png`。

遗留风险：

- 当前 Vite dev proxy 解决的是本地开发和 Tauri dev 演示面；正式打包发布前仍应实现 Tauri 侧 HTTP/proxy 能力或部署 `proxy/api/minimax.js`，否则生产包直连部分模型可能再次遇到 CORS。
- 仍有既有主 bundle 大于 500 kB warning；不阻塞 hackathon demo，但发布前应做 code splitting。
- 批注仍不写回 PDF 文件，也不复原页面 overlay；当前只保证本地列表持久化。

## 2026-05-23 gstack 规范对齐规划

来源：

- `/Users/mahaoxuan/gstack/AGENTS.md`
- `/Users/mahaoxuan/gstack/ETHOS.md`
- `/Users/mahaoxuan/gstack/SKILL.md`
- `/Users/mahaoxuan/gstack/plan-eng-review/SKILL.md`
- `/Users/mahaoxuan/gstack/qa/SKILL.md`
- `/Users/mahaoxuan/gstack/review/checklist.md`
- `/Users/mahaoxuan/gstack/review/TODOS-format.md`
- `/Users/mahaoxuan/gstack/qa/references/issue-taxonomy.md`

落地：

- 新增 `docs/GSTACK_ALIGNMENT.md`，把 gstack 的 Boil the Lake、Search Before Building、User Sovereignty、两轮 pre-landing review、QA taxonomy 和 release gate 转成 VibeReader 本地规则。
- 新增 `tasks/gstack-backlog.md`，按 gstack TODO 格式整理发布硬化 backlog。
- 新增 `tasks/bdd-tdd-phase8.md`，把发布硬化拆成可转测试的 Given/When/Then 行为。
- 新增 `docs/superpowers/plans/2026-05-23-vibereader-gstack-roadmap.md`，作为 Superpowers 可执行计划。
- 更新 `tasks/todo.md` 标题为 VibeReader，并新增 Phase 8：gstack 对齐后的发布硬化。

下一阶段：

- 按 `tasks/bdd-tdd-phase8.md` 先写红灯测试，再实现最小代码改动。
- 不扩大到 EPUB、PDF 写回或移动端。

验证：

- 本次只改文档和任务跟踪，不改运行时代码。

## 2026-05-23 Phase 8 发布硬化启动

BDD/TDD：

- `tasks/bdd-tdd-phase8.md` 已固定缺少配置、坏 key/ provider 拒绝、生产包 endpoint、Stop regression、多文档隔离和无密钥 smoke 六个行为。
- 新增 `src/modelConfigGuard.test.js`，覆盖缺少配置、缺少 API key、缺少 base URL、缺少模型名和 Anthropic-compatible 配置归一化。

改动：

- 新增 `src/modelConfigGuard.js`，提供 `validateRunnableModelConfig(config)`。
- `src/App.jsx` 在发送前调用配置 guard；校验失败时显示可读错误并且不进入 loading/request 流程。
- 新增 `scripts/qa-smoke.mjs`，作为 Phase 8 smoke 自动化入口；无 live key 时输出 `SKIPPED_LIVE_AI`。
- `package.json` 新增 `npm run qa:smoke`。

当前限制：

- `qa:smoke` 需要 Playwright 依赖；当前项目尚未安装 Playwright，因此脚本会明确报依赖缺失并退出非零。
- MiniMax 生产包通信路径仍是 P0 未完成项；当前只确认 dev proxy 和 Tauri/release 风险边界。

## 2026-05-28 Phase 8 Tauri 原生 HTTP 迁移

背景：

- Phase 7 遗留风险：生产包依赖 Vite dev proxy 解决 CORS，正式桌面包外发后 AI 请求会失效。
- 目标：Tauri 运行时使用 `@tauri-apps/plugin-http` 原生 HTTP 客户端，100% 绕过浏览器 CORS，不再依赖云端 edge function 或 Vite dev proxy。

改动：

- 新增 `src/tauriHttp.js`，封装 `@tauri-apps/plugin-http` 的流式 POST 请求，返回 `ReadableStream<Uint8Array>` 保持与浏览器 fetch SSE 解析兼容。
- 修改 `src/aiService.js`：`chatStream` 在 `isTauriRuntime()` 为 true 时走 `tauriChatStream`（直接请求完整 endpoint），否则走浏览器 `fetch`（仍经过 `resolveAiEndpointForRuntime` 和 Vite dev proxy）。
- 修改 `src/aiEndpoint.js`：新增 `shouldUseDevProxy()` 显式判断浏览器本地开发何时需要 Vite proxy。
- `src-tauri/Cargo.toml`：新增依赖 `tauri-plugin-http = “2”`。
- `src-tauri/src/lib.rs`：Builder 链追加 `.plugin(tauri_plugin_http::init())`。
- `src-tauri/capabilities/default.json`：权限数组追加 `”http:default”`。
- `package.json`：新增 `@tauri-apps/plugin-http@^2`（通过 `npm install` 自动写入）。

验证：

- `cd src-tauri && cargo check` -> pass，tauri-plugin-http v2.5.9 成功编译。
- `npm run test` -> pass，14 个测试文件共 48 个测试通过（含原有 33 个 + 新增配置 guard / endpoint / abort 测试）。
- `npm run build` -> pass，既有 bundle size warning 未恶化。
- 无 API key 硬编码；Tauri 运行时直接请求原始 endpoint，不经过本地 dev proxy。

遗留风险：

- Tauri 原生 HTTP 的 SSE 流式响应尚未在真实 MiniMax 长回复场景中手工验收；`tauriChatStream` 返回的 `ReadableStream` 与现有 SSE 解析器接口一致，但真实网络路径需 `npm run tauri:dev` + 有效 key 验证。
- 浏览器 `npm run dev` 路径仍依赖 Vite dev proxy；本地开发不受影响。
- 生产包若用户选择非 MiniMax provider（如直接 OpenAI endpoint），Tauri 原生 HTTP 同样适用，但各 provider 的 CORS 策略不同，需逐个验证。

## 2026-05-27 Agent runtime 映射

背景：

- 针对 Pi / Codex / Claude Code 这类 coding agent 的核心机制，明确 VibeReader 不能只理解为”接入一个大模型就智能”。
- 真正的 agent 能力来自：模型、上下文、工具、循环、权限、记忆和验证的组合。

落地：

- 新增 `docs/AGENT_RUNTIME_MAPPING.md`，把 coding agent harness 映射为 VibeReader 的 reading agent runtime。
- 更新 `tasks/gstack-backlog.md`，加入 `Reading agent runtime skeleton` 架构任务。

关键结论：

- VibeReader 不应照搬 Pi 的代码编辑 agent；应该借鉴其 agent loop 模式。
- VibeReader 的工具边界应是 reading-only：读当前文档、取选区、查大纲、搜索文档、生成摘要/卡片/思维导图、保存批注和 artifact。
- 后续重点是 source span grounding、context packer、bounded reading agent loop 和 artifact-centric UI。
