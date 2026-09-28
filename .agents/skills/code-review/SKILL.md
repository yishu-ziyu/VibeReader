---
name: code-review
description: VibeReader 代码评审视角：真实行为、复杂度增长、状态边界、失败路径。审查 diff / PR / 合并请求时使用。
---

# VibeReader 代码评审

评审对象是**行为**，不是行数。四个视角依次过：

## 1. 真实行为

- 这个 diff 在真实 App / 真实 UniRAG 下会发生什么？不是"测试能不能过"。
- 用户可见改动：`scripts/verify.sh` 跑过没有？`scripts/acceptance.sh` 呢？
- 证据优先：让提交者给出运行输出 / 截图 / 日志，不信任转述。

## 2. 复杂度增长

- 新增状态是否有单一 owner？原生侧对照 `CONTEXT.md`：durable 视图状态归
  PDFManager（Projector reconciles），per-tab 运行态归 TabSession，
  window 级归 TabManager。放错层的状态是未来的 bug 源。
- 有没有第二份真相（镜像 copy、平行字典、重复的页码换算）？
- 纯逻辑有没有留在可单测的纯类型里（FitEngine / PageIndexMath / RailFollow 模式）？

## 3. 状态边界

- 空文档、1 页文档、密码文档、 tear-off 窗口、tab 关闭中途、服务正要起/正要死。
- 契约两侧：App 解析 UniRAG 响应时缺字段/多余字段/类型变化怎么办
  （对照 `packages/shared-contracts/reader-unirag-memory/v1/` fixtures）。

## 4. 失败路径

- UniRAG 不可达 / 返回 500 / 超时：App 是否仍可阅读？错误是否对用户可见且真实？
- 子进程（sidecar）死亡、端口被占、重复启动。
- 文件不存在 / 无权限 / 非 PDF。

## 输出格式

按 `P0（阻断）/ P1（应修）/ P2（建议）` 分级，每条给 file:line 与行为影响，
不说风格化意见。冻结线 `apps/reader` 的改动一律标 P0 除非任务明确授权。
