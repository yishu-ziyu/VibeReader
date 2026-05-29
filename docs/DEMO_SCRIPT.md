# VibeReader Hackathon Demo Script

## Demo Goal

Show that VibeReader is no longer a Zotero-bound chat panel. It is a lightweight Tauri desktop reading workspace where local documents stay on the left and AI synthesis tools stay on the right.

## Before Demo

Run:

```bash
npm run tauri:dev
```

Use stable assets from:

```text
/Users/mahaoxuan/Desktop/ai-chat-standalone/demo-assets/
```

Recommended order:

1. `outline-demo.pdf`
2. `sample.md`
3. `wonderland_short.pdf`
4. `demo-fallback-answer.md` if the live AI provider fails

## 3-Minute Script

### 0:00-0:20 Positioning

Open `VibeReader Standalone Dev`.

Say:

> This is a local-first AI reading workspace built with Tauri. The key interaction is simple: read on the left, ask and synthesize on the right.

### 0:20-1:00 PDF Reader

Open `demo-assets/outline-demo.pdf`.

Show:

- PDF renders without a blank page.
- Outline entries appear above the page.
- Clicking `Methods` jumps to page 2.
- Zoom controls remain available.

Say:

> The reader is custom-built on pdf.js, not tied to Zotero's reader module.

### 1:00-1:45 Selection, Annotation, and AI Injection

Select a sentence on page 2.

Click:

1. `高亮`
2. `保存笔记`
3. `注入 AI`

Add a short question in Chat:

```text
用中文解释这段话，并说明它适合生成哪类复习卡片。
```

Show:

- Annotation list contains the page number and selected text.
- Chat input contains the injected source passage.

### 1:45-2:30 Universal Reading

Open `demo-assets/sample.md`.

Show:

- Markdown title, list, and code block render in the same left pane.
- Select the "The important design decision..." paragraph.
- Inject into AI.

Say:

> The same workflow works for papers, notes, and article-like documents.

### 2:30-3:00 Close

Switch through Summary, Flashcard, and MindMap tabs.

Say:

> The product direction is a reading workspace: source-grounded chat today, study and synthesis tools next.

## 8-Minute Script

### 0:00-1:00 Problem

Explain the old pain:

- Reading and asking are usually separated.
- Zotero-style readers are strong for papers but weak as a general workspace.
- Browser-only AI tools often lose local-file context.

### 1:00-2:00 Architecture

Show the app title and file picker.

Explain:

- Tauri shell keeps the desktop app lightweight.
- React workspace handles the reader and AI panel.
- Local file opening supports PDF, Markdown, Text, and safe HTML text extraction.

### 2:00-3:30 PDF Path

Open `outline-demo.pdf`.

Demonstrate:

- Outline jump.
- Page navigation.
- Zoom.
- Text selection.
- Highlight and note annotation.

### 3:30-5:00 AI Path

Inject selected PDF text into Chat.

Ask:

```text
请用中文分三点解释这段内容，并给出一个可以用于复习的问答卡片。
```

If the model streams normally, click `Stop` midway once to show interruption. Then send a shorter follow-up.

### 5:00-6:15 Universal Reader Path

Open `sample.md`, then `sample.html`.

Show:

- Markdown rendered as readable content.
- HTML shows text only; scripts are not executed.
- Selection injection works outside PDF.

### 6:15-7:15 Study Tools

Move through:

- Summary
- Flashcard
- MindMap

Describe these as synthesis surfaces connected to the same reading context.

### 7:15-8:00 Roadmap

Say:

> The current demo proves the end-to-end loop: local document, visible reader, source selection, AI context, interruption, and saved annotations. Next steps are EPUB, multi-document tabs, and export.

## Fallback Path

If AI API is slow, blocked, or returns `Failed to fetch`:

1. Do not wait on the model.
2. Show that selected source text is injected into Chat.
3. Show existing Summary, Flashcard, and MindMap tabs as the synthesis surfaces.
4. Open `demo-assets/demo-fallback-answer.md` if you need to show the intended answer shape.
5. Use annotation creation as the guaranteed offline value path.
6. Say clearly:

> The live model provider is replaceable. The product-critical loop is already local and visible: open, read, select, annotate, and pass grounded context to the assistant.

## Acceptance Checklist

- [ ] Tauri window opens as `VibeReader Standalone Dev`.
- [ ] `outline-demo.pdf` renders and outline jump works.
- [ ] Text selection shows the annotation toolbar.
- [ ] Highlight and note appear in the annotation list.
- [ ] AI injection moves selected source text to Chat.
- [ ] `sample.md` opens in the same workspace.
- [ ] Fallback path can be spoken without waiting for AI.
