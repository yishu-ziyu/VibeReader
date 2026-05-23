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
