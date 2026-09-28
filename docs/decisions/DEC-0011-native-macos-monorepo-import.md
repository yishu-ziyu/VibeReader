# DEC-0011: `apps/vibereader-macos` 并入单仓（squash import）

Date: 2026-09-28

## Context

- DEC-0009 建立原生 macOS 版（PageFlow fork + UniRAG），当时约定 M1/M2 稳定后并入单仓。
- DEC-0010 已把原生版定为唯一主力产品（native-first），Tauri 版（`apps/reader`）冻结。
- 原生版一直以嵌套本地仓形式存在（自己的 `.git`，远端 `yishu-ziyu/vibereader-macos.git`），
  并被根仓 `.gitignore` 忽略。这导致单仓缺少主力产品代码，"项目真相"分裂。

## Decision

沿用 DEC-0005 的 **squash import** 方式并入：

1. 并入前核验：嵌套仓 worktree clean，`main` 与 `origin/main` 完全同步
   （ahead/behind = 0/0，HEAD `d9cefa4`，2026-09-28 核验）。
2. 嵌套 `.git` 备份至 `~/vibereader-git-backups/vibereader-macos-git-20260928.tar.gz` 后移除。
3. 移除根 `.gitignore` 中对 `/apps/vibereader-macos/` 的忽略。
4. 以单次快照提交纳入根仓，不携带子仓历史。

## 归档与回滚

- 历史远端 `https://github.com/yishu-ziyu/vibereader-macos.git` 冻结为只读归档
  （rollback / 考古用），不再推送。
- 本地回滚路径：从备份 tarball 恢复 `.git`，并重新在根 `.gitignore` 忽略该目录。

## Not Chosen

- **subtree / filter-repo 保历史并入**：与 DEC-0005 同理——产品叙事在根仓 docs/ADR，
  协作基于快照 + 测试；保历史只增加复杂度。
- **继续嵌套**：与 DEC-0010 的"原生是唯一主线"矛盾，且阻断根仓统一
  build / test / verify / acceptance 开发控制面（Issue #1）。

## Consequences

- 根仓自此拥有全部产品代码；`apps/vibereader-macos` 成为唯一 canonical product。
- PageFlow 上游（pinchen147/PageFlow，Apache-2.0）的 LICENSE / README attribution
  随快照完整保留；后续修改须继续保留（DEC-0008 约束）。
- CI 可以直接构建 / 测试原生目标（Issue #1 P2）。
- 子仓历史查询去 `vibereader-macos.git` 归档或备份 tarball。
