# Vibero Standalone 任务跟踪

最后更新：2026-05-23

## 当前决策

- [x] 主战场选择 `/Users/mahaoxuan/Desktop/ai-chat-standalone`
- [x] 放弃把 Zotero fork 作为 Hackathon 主线
- [x] 桌面壳选择 Tauri v2
- [x] Hackathon 格式优先级：PDF + Markdown/Text，EPUB 后置
- [x] 当前基线验证：`npm run build` 通过，有 bundle size warning

## Phase 0：保护现场

- [ ] 初始化 git，或创建时间戳备份目录
- [ ] 创建/更新 `DEVLOG.md`
- [ ] 记录当前 webpack build 基线
- [ ] 标记当前版本为迁移前基线

验收：

- [ ] `git status` 可用，或备份目录存在
- [ ] `npm run build` 通过
- [ ] `DEVLOG.md` 有 Phase 0 记录

## Phase 1：Tauri v2 壳

- [ ] 安装 Tauri v2 依赖
- [ ] 迁移 webpack 到 Vite
- [ ] 初始化 `src-tauri`
- [ ] 配置应用名、bundle id、窗口尺寸、图标
- [ ] 添加 scripts：`dev`、`build`、`tauri:dev`、`tauri:build`

验收：

- [ ] `npm run dev` 通过
- [ ] `npm run build` 通过
- [ ] `npm run tauri:dev` 打开桌面窗口

## Phase 2：本地文件打开

- [ ] 新增 `src/services/documentService.js`
- [ ] 定义统一文档对象
- [ ] Tauri 环境接入系统文件选择器
- [ ] 浏览器环境保留上传 fallback
- [ ] PDF 打开后继续复用 `extractTextFromPDF` 和 `PdfViewer`

验收：

- [ ] 桌面窗口可选择本地 PDF
- [ ] PDF 解析成功
- [ ] PDF 视觉渲染成功
- [ ] 打开失败有明确错误提示

## Phase 3：阅读器 + AI 双栏工作台

- [ ] 新增 `WorkspaceLayout`
- [ ] 中间显示文档阅读器
- [ ] 右侧显示 AI 面板 Tabs
- [ ] 加可拖拽分隔线
- [ ] 窄屏/小窗口有降级状态

验收：

- [ ] 阅读器和 AI 面板同时可见
- [ ] 拖拽不会压坏布局
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

2026-05-23：已完成本轮规划接力。当前尚未开始代码实现；下一步应从 Phase 0 版本保护开始。
