# uni-rag 开发指南

> 本文档是给下一个 agent 的接入指南：项目是什么、现在什么状态、怎么开始。

## 你是谁

你是 uni-rag 项目的开发 agent。uni-rag 是一个本地文档问答工具（上传文档→问问题→得到带引用的答案）。项目地址：https://github.com/yishu-ziyu/uni-rag

想法的跟进用 yishuship，只在用户输入命令时使用：

| 命令 | 什么时候用 |
|------|-----------|
| `/yishuship:idea <一句话>` | 新功能、新想法：先变成用户能看到的行为，等用户决定 |
| `/yishuship:next` | 继续这个项目里正在做的想法 |
| `/yishuship:ideas` | 看所有项目里还活着的想法 |

进度在 `.ship/ideas/<名字>.md`；`.ship/tasks/` 是旧版记录，只读。


## uni-rag 项目状态

### 已完成

- v1.0.0 发布（2026-06-25）：核心功能 + 安全修复 + 产品文档
- v1.0.1（2026-06-25）：26 个新测试 + 定位表达重做
- 测试：198 passed / 6 skipped / 0 failed
- 安全：BM25 pickle→JSON、SSRF 防护、路径遍历防护

### 产品定位

**一句话**：问你自己的文档，数据永远不离开你的电脑。
**差异化**：NotebookLM 把文件传到 Google 服务器，uni-rag 在本地完成一切。
**三条卖点**：本地处理 / 按需选模型 / PDF+网页+视频混合来源

### 技术栈

- 后端：Python 3.13 + FastAPI + ChromaDB + SQLite
- 前端：React + TypeScript + Vite
- LLM：MiniMax / StepFun / 本地 Ollama（多 Provider）
- 测试：pytest（198 个测试）
- 包管理：uv

### 核心功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 文件上传（PDF/MD） | ✅ | 含 LlamaParse 语义解析 |
| URL 入站 | ✅ | 网页/YouTube/Bilibili |
| 多 Provider 问答 | ✅ | MiniMax/StepFun/本地 |
| 引用溯源 | ✅ | 页码+段落定位 |
| 闪卡/测验/图谱 | ✅ | 知识加工模式 |
| 翻译 | ✅ | mode=translate |
| 建议问题 | ✅ | /api/suggest-questions |
| 多轮会话 | ✅ | SQLite 持久化 |
| CLI | ✅ | ingest/ask/serve |
| Docker | ✅ | docker-compose |

### 已知待改进

| 问题 | 优先级 | 说明 |
|------|--------|------|
| App.tsx 1139 行单文件 | P1 | 需要拆分组件 |
| 引用卡片不可折叠 | P1 | 用户反馈最差的体验 |
| 无速率限制 | P2 | API key 可被滥用 |
| SessionStore 并发竞态 | P2 | 高并发下可能主键冲突 |
| 前端测试只检查源码字符串 | P2 | 需要改为行为测试 |

### 产品文档

- `docs/PRODUCT.md` — 产品规格（用户、Golden Journeys、Non-goals）
- `docs/ARCHITECTURE.md` — 系统架构（Mermaid 数据流图）
- `CHANGELOG.md` — 版本变更记录
- `DEVLOG.md` — 开发日志

## 如何开始

### 场景 1：用户说"加个功能"

用户输入了 `/yishuship:idea` 就按它走。没有的话，先和用户确认用户能看到的行为，再实现；
做完附上真实运行的证据（截图、接口返回、测试输出），而不是"应该能跑"。

### 场景 2：用户说"修个 bug"

先用一句话说清根因并拿到能复现的方法，再动代码；修完补一条会在旧代码上失败的回归测试。

### 场景 3：用户说"看看现在有什么问题"

审查当前代码，再把应用跑起来实际走一遍；把发现的问题直接列给用户，按严重程度排序。


## 项目结构

```
uni-rag/
├── src/uni_rag/
│   ├── api/          FastAPI 路由 + schema
│   ├── ingest/       文件/URL/视频入站
│   ├── rag/          RAG pipeline
│   ├── llm/          LLM 客户端（多 Provider）
│   ├── retrieve/     检索器（向量+BM25+rerank）
│   ├── cite/         引用定位+验证
│   ├── store/        ChromaDB + SQLite + BM25
│   ├── session/      会话存储
│   ├── export/       MD/PDF 导出
│   └── config.py     配置（pydantic-settings）
├── frontend/
│   └── src/App.tsx   React 前端（单文件，待拆分）
├── tests/
│   ├── unit/         单元测试
│   ├── integration/  集成测试
│   └── bdd/          BDD 验收测试
├── docs/
│   ├── PRODUCT.md    产品规格
│   └── ARCHITECTURE.md 系统架构
├── .ship/            ideas/：yishuship 进度文件；tasks/：旧版记录（只读）
├── CLAUDE.md         项目开发守则
├── DEVLOG.md         开发日志
└── CHANGELOG.md      版本变更
```

## 关键约定

1. **环境变量**：`UNI_RAG_DATA_DIR_PATH`（数据目录）、`UNI_RAG_LLM_API_KEY`（API key）
2. **测试 fixture**：必须 `monkeypatch.setenv` + `cfg._settings = None` 重置单例
3. **前端构建**：`cd frontend && npx tsc -b`（TypeScript 检查）
4. **后端测试**：`uv run pytest tests/ --tb=short`（全量测试，~8 分钟）
5. **提交规范**：conventional commits（feat/fix/refactor/docs/test）

## 现在就开始

用户可能会告诉你要做什么。有 yishuship 命令就按命令走；没有就直接完成请求，并按上面的约定验证。
