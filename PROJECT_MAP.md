# VibeReader Project Map

Last updated: 2026-05-23

## Current mainline

`/Users/mahaoxuan/Desktop/ai-chat-standalone`

This is the active Hackathon development surface. New work should happen here unless a task explicitly says otherwise.

Runtime identity:

- Product name: `VibeReader`
- Development window title: `VibeReader Standalone Dev`
- Tauri bundle identifier: `cn.yishuziyu.vibereader`
- Rust package and debug binary: `vibereader`
- NPM package name: `vibereader-desktop`
- Dev server URL: `http://127.0.0.1:3217`

## Historical surfaces

`/Users/mahaoxuan/Desktop/黑客松/Vibero`

Historical Zotero fork and reference repository. Do not use this as the implementation mainline for the standalone app.

`/Users/mahaoxuan/Desktop/黑客松/_apps/Vibero.app`

Old built app. Do not use this app for validation of current work. If it is open, close it before starting manual QA.

## Validation target

Use a real PDF file for manual PDF QA:

`/Users/mahaoxuan/Desktop/黑客松/Vibero/test/tests/data/wonderland_short.pdf`

Avoid selecting paths that only end in `.pdf` but are actually directories.

## Local model services

Use `docs/LOCAL_MODEL_SERVICES.md` before changing model defaults, QA seed configs, or provider templates.

Current default QA path is MiniMax Token Plan:

- Model: `MiniMax-M3`
- Protocol: Anthropic-compatible
- Base URL: `https://api.minimaxi.com/anthropic`
- Env var: `MINIMAX_TOKEN_PLAN_KEY`

MiniMax API is a separate choice for pay-as-you-go API keys:

- Provider key: `minimax-api`
- Env var: `MINIMAX_API_KEY`

Kimi/Moonshot is optional only when a real key is present. Do not restore keyless Kimi free-trial behavior.
