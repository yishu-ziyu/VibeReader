# Vibero Standalone 任务跟踪

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
- [ ] 选区注入仍能用

## Phase 4：Stop generating

- [ ] `aiService.chatStream` 支持 `AbortSignal`
- [ ] UI 保存当前 `AbortController`
- [ ] `ChatInput` loading 时显示停止按钮
- [ ] 停止后保留已生成内容

验收：

- [ ] 长回复可中断
- [ ] UI 停止 loading
- [ ] 控制台无未捕获异常

## Phase 5：Markdown/Text 阅读

- [ ] 新增 Markdown 文档阅读器
- [ ] 新增 Text 文档阅读器
- [ ] HTML 只做安全正文读取，不执行脚本
- [ ] 所有文本阅读器支持选区注入

验收：

- [ ] `.md` 可打开
- [ ] `.txt` 可打开
- [ ] `.html` 可安全打开或给出明确提示
- [ ] 选区可注入 AI

## Phase 6：PDF 大纲与最小批注

- [ ] `pdfDoc.getOutline()` 显示目录
- [ ] 点击目录跳转
- [ ] 选区创建高亮记录
- [ ] 选区创建笔记记录
- [ ] 批注保存到 IndexedDB

验收：

- [ ] 有目录 PDF 可跳转
- [ ] 批注列表刷新后仍存在
- [ ] 不要求第一版写回 PDF 文件

## Phase 7：演示准备

- [ ] 新建 `demo-assets/`
- [ ] 准备 PDF/Markdown/Text 示例文件
- [ ] 新建 `docs/DEMO_SCRIPT.md`
- [ ] 写 3 分钟和 8 分钟演示脚本
- [ ] 按 `docs/ACCEPTANCE_AND_QA.md` 完整验收

验收：

- [ ] 3 分钟演示闭环可跑通
- [ ] 失败备用路径可执行
- [ ] 最终 QA 结果写入 `DEVLOG.md`

## Review

2026-05-23：已完成本轮规划接力，并完成 Phase 0 版本保护。当前基线提交为 `e6ea59f`。下一步应从 Phase 1：Tauri v2 壳 + Vite 迁移开始。

2026-05-23：继续执行 Phase 1/2。已完成 Vite 迁移、Tauri v2 初始化、dialog/fs 插件、桌面图标、统一文档服务和文档状态 store。`npm run build`、`cargo check`、`npm run tauri:dev` 均通过。剩余需要在真实桌面交互中选择一份 PDF，完成 A3/A4/A5 手工验收。

2026-05-23：根据真实截图和 dev 日志修复 PDF 可视渲染链路：拦截名字以 `.pdf` 结尾的目录，增加 `fs:allow-stat`，并为 pdf.js 文本解析和 Viewer 渲染拆分独立 byte copy。下一次手工验收建议选择 `/Users/mahaoxuan/Desktop/黑客松/Vibero/test/tests/data/wonderland_short.pdf`。

2026-05-23：为避免旧 Zotero fork、旧 `_apps/Vibero.app` 与当前 Tauri dev app 混淆，当前主线命名为 `VibeReader Standalone Dev`，并新增 `PROJECT_MAP.md` 作为路径和验收对象说明。下一步先完成真实 PDF 可视验收，再推进 Phase 3 双栏工作台。

2026-05-23：真实 PDF 验收通过。通过 `http://127.0.0.1:3217/` 灌入 `/Users/mahaoxuan/Desktop/黑客松/Vibero/test/tests/data/wonderland_short.pdf`，页面显示 `PDF 已加载，共 29 页`，文本层包含 Alice in Wonderland 内容，canvas 数量为 1，尺寸 612x792，采样到 613 个非白像素样本。截图保存在 `/tmp/vibereader-pdf-qa.png`。

2026-05-23：Phase 3 双栏工作台已落地。左侧 PDF 阅读器与右侧 AI Tabs 同屏显示，拖拽分隔线将阅读器宽度从 666.8px 调整到 551px，右侧 AI 面板同步扩展到 589px；窄屏 820px 验证为上下堆叠且无横向溢出。桌面截图 `/tmp/vibereader-dual-pane-qa.png`，窄屏截图 `/tmp/vibereader-dual-pane-narrow-qa.png`。剩余需手工验证 PDF 选区注入。
