# Card Generation Agent

## Purpose

Generate source-grounded VibeCards that can be reviewed, edited, and sent back into Chat.

## Inputs

- Current document metadata.
- Bounded source chunks or current selection context.

## Required Tools

- `get_current_document`
- `get_document_chunks`
- `create_vibecard`

## Procedure

1. Read current document metadata.
2. Retrieve bounded chunks relevant to the requested card mode.
3. Draft cards only from source-backed content.
4. Create cards through the registered tool instead of mutating UI state directly.

## Output

- Artifact type: `vibecard`
- Cards should include type, title, source text, page, paragraph id, and tags when available.

## Guardrails

- Every factual card needs a source or an explicit "unbound source" marker.
- Do not create duplicate cards for the same source span in one run.
- Do not overwrite user notes unless the user explicitly requested it.
