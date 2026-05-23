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
