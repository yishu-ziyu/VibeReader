# DEC-0012：源码与本机归档统一入口

Date: 2026-10-06
Status: verified

## Change

VibeReader 只有 `vibereader/` 一个源码和项目历史的管理入口。
`apps/vibereader-macos`、`apps/reader`、`services/uni-rag` 维持原位置。
家目录的历史备份归入 `.local/archives/git-backups/`；旧 UniRAG 残留数据归入
`.local/archives/unirag-legacy-data/`。两项均不进入 Git。

## Not this

不删除备份或残留数据，不恢复旧实现，不合并历史 Git 仓库，不移动已安装的 App、
Application Support 中的模型和知识库，不改产品运行路径，不提交或推送。

## Verification

- 迁移前后逐项核对内容 SHA256、空目录及软链接；保留清单在 `.local/archives/manifest.json`。
- 旧归档和残留目录消失，归档目标是真实目录，不留兼容软链接。
- 核验归档被 Git 忽略；主项目 HEAD 和原有组件文件改动不变。
- 核对常用项目目录、已记录旧路径、Git worktree 与源码目录中的嵌套仓库。
  核对范围为 Desktop 项目目录、Developer、Documents、projects、Archives、DevSpace
  及 Codex worktrees；不把已安装应用或模型目录视为分散源码副本。

## Evidence

172 项文件、目录与链接的迁移前后清单完全一致。
`.local/archives/verification.json` 记录 `passed=true`、组件原有改动与 HEAD 不变。
两个外部旧目录均已移走，目标目录真实存在并被 Git 忽略。历史决策中的原路径
保留当时记录，当前入口以 PROJECTS.md 为准。

在项目根目录可重复核对归档文件：

```bash
python3 - <<'PY'
import hashlib, json, os
from pathlib import Path
manifest = json.loads(Path('.local/archives/manifest.json').read_text())
for group in manifest['groups']:
    assert not Path(group['old']).exists()
    for name, entry in group['entries'].items():
        path = Path(group['new']) / name
        if 'sha256' in entry:
            assert hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256']
        elif 'link' in entry:
            assert path.is_symlink() and os.readlink(path) == entry['link']
        else:
            assert path.is_dir()
print('PASS: local archives intact')
PY
```

核对常用项目路径和登记的 Git worktree 后，没有额外的这三部分源码仓库。
`design-parts-mcp/library/living/pageflow` 是 HTML 视觉参考，不是 PageFlow 源码副本，保持不动。
`/Applications/VibeReader.app` 和 `~/Library/Application Support/VibeReader/` 是安装及
运行数据位置，保持不动。本次不改产品代码，未启动或宣称通过真实 App 功能验收。
