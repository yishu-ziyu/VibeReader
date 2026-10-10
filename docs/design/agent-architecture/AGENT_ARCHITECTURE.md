# VibeReader 阅读智能体（Agent）子系统架构

- 日期：2026-08-31
- 范围：`apps/reader/src/agent/`（26 个模块）+ 宿主集成（App.jsx）+ 评测脚本
- 配套可视化：[agent-architecture.html](./agent-architecture.html)
- 证据：全部结论来自代码实读，附文件:行号

---

## 1. 分层总览

```text
宿主层    App.jsx（4 个入口 + adapters 六件套装配 + 写类二次确认）
编排层    taskRunner（任务持久化/进度/toolOutcome） · multiAgent（深读流水线+critic） · documentQaChat（Chat 门控）
内核层    runtime（agent loop） · permissions（门禁） · contextPacker/contextCompression（上下文工程） · trajectory/observation/spanExport（观测）
模型层    modelFactory（LLM→本地解析） · llmModel（OpenAI 兼容适配） · readingTaskModels（7 个本地确定性模型） · skills（7 技能注册表）
工具层    tools（16 个工具注册表） · toolSchemas（JSON Schema）
支撑层    services×4（ragEngine/persistentStorage/artifact/savedMemory） · experienceStore（经验） · eval/（评测）
```

依赖方向严格自上而下，**唯一例外**：`taskRunner.js:1` 反向依赖 `../services/persistentStorage`（压力点 P1）。

## 2. 内核：runtime agent loop（runtime.js）

`runReadingAgent(options)` → `runLoop`：

1. 预检 model 可调用 → `packDocumentContext` 打包上下文（预算 1200 tokens）
2. `for iteration=1..maxIterations`（默认 4，LLM 8-10）
3. 每轮：abort 检查 → `model({goal, context, trace快照, tools, permissions, status, abortSignal})` → trace 冻结追加 + emit 事件（onEvent 回调 + trajectoryRecorder 双通道，异常互不影响）
4. 响应分支：`final` → **groundingGate（唯一接入点，final 时）** → 返回；`tool_call` → 解析 4 种形状（单/多/snake_case/name 别名）→ 逐个 权限检查 → 执行（支持 abortSignal 透传）→ trace 带 durationMs
5. 终止态：final / max_iterations / timeout / error / permission_denied / invalid_response
6. 收尾：metrics（wallMs/llmCallCount/toolDurations）+ 可选 observability（statusBar/步骤摘要）+ 可选 OTel 风格 span 树（无 SDK）

**groundingGate**（groundingGate.js）：off/warn/strict 三档；warn 在 content 追加 `[grounding warning]`，strict 把 status 改 `ungrounded`。校验：空答案 / 零工具调用 / claim-heavy 无 sourceRefs；证据工具白名单（search_document / get_document_chunks / knowledge_search / get_page_text）且要求非空证据文本。

## 3. 工具体系（tools.js：16 个）

**只读 12 个**（默认全放行）：get_current_document / get_document_chunks / get_page_text / search_document / list_attention_insights / knowledge_search / memory_search / verify_citation / list_tools / extractText / navigatePage / listAnnotations
**写入 4 个**（默认拒绝，按技能展开）：create_vibecard / create_annotation / export_note / memory_save

关键机制：
- **knowledge_search 四层降级链**：adapter（带 signal）→ 结构化降级标记 → ragAdapter.health 门 → buildRetrievalContext → query → 纯本地关键词。AbortError 永不降级。
- **memory_save 三重门**：`userConfirmed===true`（模型不能自确认）→ artifact 类型白名单 → startSavedMemoryIngest（契约 v1）。权限位 `canWriteMemory` 默认 false。
- **verify_citation**：纯词元 Jaccard（阈值 0.2），无 LLM。
- schema：`TOOL_PARAMETER_SCHEMAS` 逐工具 JSON Schema → OpenAI function-calling 转换（llmModel 复用）。
- 权限模型：`isToolAllowed` = 工具在 allowedTools ∩ capability 标志；允许列表由 `buildReadingAgentPermissions(taskType)` 按技能展开（5 个技能有专属展开，card_generation 加 create_vibecard+canWriteVibeCards）。

## 4. 技能与模型：双路径设计

**技能注册表**（skills.js）：7 个技能（paper_overview/attention/card_generation/note_export/knowledge_qa/critic/memory_curator），各带 goal/requiredTools/outputArtifactType/maxIterations；**system prompt 单一来源** = `docs/reading-agent-skills/*.md`（Vite ?raw）+ Goal/Tools/Output/预算四行。

**模型解析**（modelFactory）：`preferLlm && baseUrl+apiKey+model 齐全` → LLM 路径（timeout 120s，maxIter 8-10，温度 0.2，system prompt 追加经验 lessons）；否则 → 本地确定性模型（timeout 30s，maxIter 按注册表）；LLM 构造异常回落本地。

**本地确定性模型**（readingTaskModels.js）：7 个按迭代驱动的状态机（读 trace 回放），离线全功能。card_generation 有硬约束：候选 chunk <3 且未建卡 → 直接 final 放弃；≥3 则循环建满 3 张，卡片 `verificationStatus:'grounded'`。

**llmModel 适配**（OpenAI 兼容）：tool_calls 双模式（1 个→旧单形状，2+→数组，runtime 都吃）；trace→messages 重放；>1500 tokens 触发 trace 压缩（保最后 2 个 model 步）；sourceRefs 提取（json fence → 裸 JSON → [p.1] 页码引用，上限 40）；每轮注入状态栏 trailer。

## 5. 编排层

- **taskRunner**：任务生命周期持久化（pending→running→succeeded/failed，进度 10-90% 映射，中间 trace 保 12 步）→ Tauri `task_records` 表 + `vibereader:task-updated` window 事件 → TaskStatusPanel；结果聚合 `toolOutcome`（vibecardsCreated/noteExported，D7）；成功失败都写 experienceStore。
- **multiAgent 深读流水线**：paper_overview → attention → card_generation（+可选 note_export），步间共享上下文（`priorStepSummaries` 注入下一技能 goal）；**critic sidecar**：card_generation 成功后（或无卡的末步）用 critic_agent 只读复核（maxIter 8），异常不炸管线；聚合状态 completed/partial/failed。
- **documentQaChat**：Chat 内 agent QA 的开关门（默认 OFF，localStorage/env 可开），失败落穿 UniRAG/直连模型。

## 6. 上下文工程

- **contextPacker**：goal→metadata→selection→outline→annotations→body 优先级打包，预算 1200 tokens，放不下截尾。
- **contextCompression**：两级——trace 压缩（保最后 2 model 步 + 小结果原文，其余摘要 160 字符）；packed context 按优先级丢块（body 最先丢，goal 最后丢）。
- **observation/trajectory/spanExport**：工具结果状态栏（三处消费）；内存轨迹环（cap 200）；OTel 风格 span 树导出（无 SDK）。
- **experienceStore**：成功失败都记录（goal/status/压缩 trace/summary）；4 条规则式 lessons 拼进 system prompt；`proposeSkillImprovements` 产出人在环改进提案，**从不自动改 skill md**。

## 7. 评测体系（三模式，复用同一 runtime）

| 模式 | 脚本 | 网络 | 说明 |
| --- | --- | --- | --- |
| offline | agent-eval-offline.mjs | 零网络 | CI 可跑；7 内置用例 + 评分器 |
| live | agent-eval-runner.mjs | Grok@本地代理 | Pass@k、用例过滤、proxy 不可用退出码 2 |
| deep-read | agent-eval-deep-read.mjs | 可选 | multiAgent 流水线 + critic 开关 |

评分器 `scoreAgentResult`：mustCallTools / minSourceRefs / minCards / 并行工具数（soft）/ **硬否决：claim-heavy 零工具**；严格度 env 可调。

## 8. 压力点（14 项，编号 P1-P14）

**层次与耦合**
- P1 `taskRunner` 反向依赖 services/persistentStorage（层次倒置，且行为分叉藏在 service 内）
- P2 `readingAgentOptions` 耦合最重：同时 import 4 个 services + 5 个 agent 内模块，App 又包一层 wrapper 形成双入口
- P3 `resolveGroundingMode` 同名双实现语义不同（gate 归一化 vs 产品决策），barrel 需别名规避冲突
- P4 knowledge_search 双重健康门（tools 降级链内 + adapter 内各一次），失败包装两套

**一致性与重复**
- P5 工具错误策略不一致：读类本地兜底 / 写类抛错 / memory_search 软 unavailable
- P6 工具命名混排：13 个 snake_case + 3 个 camelCase 同注册表
- P7 trace 摘要/状态判定三处重复（runtime/trajectory/spanExport）；`lastToolFromTrace` 两份
- P10 `hasRunnableLlmConfig` 逐字符复制两份（documentQa/modelFactory）
- P14 `export *` barrel 冲突靠手工具名 re-export 管理

**产品与测试**
- P8 产品代码为测试让路（App wrapper、skillDocuments 测试后门、runtime 仅测试引用的常量）
- P9 card_generation 关键数字（3-chunk/maxIter6/LLM10/toast≥3）分散 5 处无单一来源
- P11 App 四条路径重复组装 adapters 六件套，变更需四处同步
- P12 memory_save 三重门分散三文件，且预留的权限展开无任何默认技能使用（默认不可达）
- P13 window 事件协议为裸字符串（task-updated/navigate-*），无类型约束

## 9. 演进建议（下一轮 agent 重构候选，按 ROI）

1. **P11+P2**：抽 `createAgentAdapters()` 单一装配点，App 四处调用合一；readingAgentOptions 拆出纯权限/装配与 service 绑定两层
2. **P1**：taskRunner 的持久化改为注入（调用方传 `persistTask` 适配器），agent 层回到零 services 依赖
3. **P9+P5**：技能预算/约束收敛进 skills 注册表元数据（`minSourceChunks` 等字段），工具错误策略统一为「结构化 unavailable + 可选兜底」
4. **P7+P10**：trace 摘要收敛到 trajectory 单一实现；hasRunnableLlmConfig 收进 modelFactory 导出
5. **P13**：window 事件名收敛为常量模块（低成本先行）
