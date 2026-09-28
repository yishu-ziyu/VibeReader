---
name: vibereader-acceptance
description: VibeReader 项目定制验收：真实 PDF → 真实 App → 用户动作 → 可见结果 → UniRAG 正常路径 + 失败路径 → 目标验证。声明"功能完成"之前必须使用。
---

# VibeReader 验收

一句话：**在真实 App 里，用真实 PDF，看到真实结果，并打穿一条失败路径。**

自动化入口：`scripts/acceptance.sh`（覆盖服务黄金路径 + App 失败路径 + App×服务
存活证据）。本技能补充脚本覆盖不到的**人工用户动作**与**判定标准**。

## 验收链

```
真实 PDF → 真实 App → 用户动作 → 可见结果
→ 若涉及 AI：UniRAG 正常路径（answer + citation + 跳转）
→ 至少一个失败路径（服务不可用 / 边界输入）
→ 目标验证（对照原始意图逐条核对）
```

## 执行步骤

1. **准备**：`scripts/dev-native.sh` 启动真实 App（Debug）。准备一份与改动
   相关的真实 PDF（不是合成极端样本；仓库 fixture：
   `services/uni-rag/tests/fixtures/sample.pdf`）。
2. **正常路径**：按改动的用户流程亲手操作一遍（打开 → 阅读 → 若涉及问答：
   等服务健康 → 提问 → 看 answer 与 citation）。
3. **citation 跳转**：点击 citation，验证跳到**正确页**且高亮落在**引用段落**
   （跨页 chunk 看 chunk 起始页；定位失败时面板要有真实说明，见 CONTEXT.md
   "Citation highlight"）。
4. **失败路径**（至少一条）：
   - 服务不可用：占住/杀掉 8766 再走问答流程 → App 不崩溃、显示真实失败态、
     关掉面板仍可正常阅读；
   - 或按改动选择：空 PDF / 加密 PDF / 超大 PDF / 断网模型调用失败。
5. **目标验证**：回到任务意图，逐条核对可观察结果。没有全部命中就不算完成，
   即使 build / 单测全绿。

## 证据要求

- 每步留下可追溯证据：截图（关键界面 + 失败态）、日志摘录、curl 请求/响应。
- 报告格式：意图 → 动作 → 观察 → 结论（每条验收点 PASS/FAIL）。
- 自动化部分直接引用 `scripts/acceptance.sh` 的输出与
  `test-results/acceptance-*/` 证据目录。

## 边界

- 需要真实 LLM key 的问答路径在本机跑（sidecar 从 Keychain/.env 注入）；
  CI 只跑 build + 单测 + 契约（不承担 GUI/大模型验收）。
- 不要为了绿灯降低断言（如把 citation 页码检查删掉）——那是验收失效，不是通过。
