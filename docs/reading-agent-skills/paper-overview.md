# Paper Overview Agent

## Purpose

Create a concise, source-grounded overview for the current document.

## Inputs

- Current document metadata.
- Bounded source chunks from the current document.

## Required Tools

- `get_current_document`
- `get_document_chunks`

## Procedure

1. Read current document metadata.
2. Retrieve bounded chunks around abstract, introduction, method, results, and conclusion signals.
3. Produce a short overview with cited source refs.

## Output

- Artifact type: `reading_note`
- Content should include document name, type, major source snippets, and source refs when available.

## Guardrails

- Do not claim facts not present in retrieved chunks.
- Do not persist API keys, headers, or model internals.
- If source chunks are unavailable, say so instead of inventing a summary.
