# VibeReader Project Index

Updated: 2026-10-06

## Canonical Local Root

```text
/Users/mahaoxuan/Desktop/AI 产品/vibereader
```

Open this directory first when continuing the product. Agent entry point: [AGENTS.md](AGENTS.md).

## Current Layout

```text
vibereader/
  apps/
    vibereader-macos/  # canonical product: native macOS reader (DEC-0010/0011)
    reader/            # FROZEN: legacy Tauri reader, reference-only
  services/
    uni-rag/           # local RAG backend / knowledge module
  packages/
    shared-contracts/  # reader-unirag-memory v1 fixtures
  docs/
  scripts/             # unified dev/verify/acceptance entry points
  .local/archives/     # local-only Git history backups and legacy data
```

## Project Roles

| Path | Role | Git Remote | Current Use |
| --- | --- | --- | --- |
| 仓库根（全部代码 + 契约 + 文档） | 单一公开产品仓库 | `https://github.com/yishu-ziyu/vibereader.git` | **唯一活跃开发入口（DEC-0005 / DEC-0011）** |
| `apps/vibereader-macos` | 唯一主力产品：native macOS 版（PageFlow fork + UniRAG） | 本仓直接追踪（DEC-0011，2026-09-28 squash import） | **canonical product** |
| `apps/reader` | 旧 Tauri 版，AI 功能参考实现 | 本仓直接追踪（DEC-0005） | **frozen / reference-only**（DEC-0010） |
| `services/uni-rag` | 本地知识后端，sidecar 分发 | 本仓直接追踪（DEC-0005） | active |

Author Vibero local copies were deleted on 2026-08-13 (`legacy/vibero`, `黑客松/_apps`, `黑客松/_downloads`). Do not restore them.

## Canonical Entry

旧 Reader 入口 `/Users/mahaoxuan/Desktop/黑客松/阅读器/ai-chat-standalone` 已移除。统一从本仓库进入。

旧独立 UniRAG 路径 `/Users/mahaoxuan/Desktop/AI产品经理/uni-rag` 当前不存在。
`/Users/mahaoxuan/Desktop/产品项目学习/uni-rag` 只剩旧日志，已于 2026-10-06
完整移入 `.local/archives/unirag-legacy-data/`。UniRAG 当前源码入口只有 `services/uni-rag`。

历史 Git 和数据备份已从 `~/vibereader-git-backups/` 完整移入
`.local/archives/git-backups/`。归档目录不进入 Git；文件完整性与迁移范围见
[DEC-0012](docs/decisions/DEC-0012-local-archive-consolidation.md)。
下文历史阶段及旧决策中保留的外部路径描述当时状态，不是当前入口。

Treat the new paths as canonical in new docs, prompts, scripts, and future commits.

## Git State Notes

- `apps/reader` Reading Agent Wave 17 已并入本仓库（旧 handoff 文档已于 2026-10-10 删除，见 `docs/IDEAS.md`）。Prior contract: `4ec8191`.
- `services/uni-rag` is clean after commit `b093749 feat: stabilize reader memory contract` and push to `https://github.com/yishu-ziyu/uni-rag.git`.
- All code now lives in this single repository (DEC-0005 for reader + uni-rag, DEC-0011 for vibereader-macos); no nested repositories remain.
- Author Vibero is gone from disk. Ignore leftover mentions of `legacy/vibero` in older ship notes.

## Agent Collaboration

GLM may produce implementation slices, tests, and local delivery notes. Codex is responsible for gatekeeping before the work becomes project truth:

- verify the changed files and contracts instead of trusting a text summary;
- run the relevant unit/integration/smoke tests with the project venv;
- remove generated runtime artifacts from Git;
- commit and push accepted code to the current remote;
- record durable decisions in this workbench, not only in chat.

For UniRAG Python tests, prefer:

```bash
uv run python -m pytest ...
```

The plain `uv run pytest` entry can hit a stale pytest script after local folder moves.

## Cloud Repository Strategy

Current cloud state (after DEC-0005 and DEC-0011 cutover):

| Local path | Current remote | Role |
| --- | --- | --- |
| repository root | `https://github.com/yishu-ziyu/vibereader.git` | **唯一活跃仓库**：全部代码 + 契约 + 文档 |
| `services/uni-rag`（历史） | `https://github.com/yishu-ziyu/uni-rag.git` | 只读归档（cutover 前已完整推送） |
| `apps/vibereader-macos`（历史） | `https://github.com/yishu-ziyu/vibereader-macos.git` | 只读归档（并入前已完整推送；本地 `.git` 备份于 `.local/archives/git-backups/vibereader-macos-git-20260928.tar.gz`） |

Repository retention policy:

- 原 Reader 单体仓已由本仓库接管 `vibereader` 名称并删除；
- `uni-rag.git`、`vibereader-macos.git` 冻结为只读归档，不再推送；
- 不创建更多分散的产品远程。

Durable decisions: `docs/decisions/DEC-0004-retain-subrepos-until-monorepo-cutover.md`（已被 DEC-0005 取代）、`docs/decisions/DEC-0005-monorepo-squash-import.md`、`docs/decisions/DEC-0011-native-macos-monorepo-import.md`。

## Consolidation Plan

Phase A: done.

- Physically colocate the three project directories under this workbench.
- Preserve old paths as symlinks.
- Keep each repository's own `.git` intact.

Phase B: done.

- Add root-level scripts for common workflows:
  - start Reader,
  - start UniRAG,
  - run Reader tests,
  - run UniRAG tests,
  - run integration smoke.
- Shared contracts now live at `packages/shared-contracts/reader-unirag-memory/v1/`. Reader and UniRAG contract tests both reference these fixtures via relative path lookup, with temporary compatibility for the old `contracts/` path.

Phase C.0: done.

- Initialize the workbench root as a Git repository for product-level assets.
- Track `packages/shared-contracts`, `docs`, `.ship`, root scripts, `README.md`, and `PROJECTS.md`.
- At this phase, `apps/reader` and `services/uni-rag` were still ignored nested repositories pending review; Phase C.1 resolved this.
- Root remote was created and tracked `origin/main`.

Phase C.1: done (2026-08-31, DEC-0005).

- Audited both child repositories: clean worktrees, fully pushed to their remotes.
- Cutover method chosen and executed: **squash import**（子仓历史由归档远程承载，根仓收一份快照）。
- Nested `.git` 备份于 `~/vibereader-git-backups/` 后移除；根仓已拥有全部 app/service 代码。
- 旧远程冻结为只读归档。

Phase C.2: done (2026-09-28, DEC-0011).

- `apps/vibereader-macos` squashed into this repository (nested `.git` archived to
  `~/vibereader-git-backups/vibereader-macos-git-20260928.tar.gz`, old remote frozen
  read-only). The single-repo layout is now complete:

```text
apps/vibereader-macos   # canonical product
apps/reader             # frozen reference
services/uni-rag
packages/shared-contracts
packages/model-providers  # 规划中
```
