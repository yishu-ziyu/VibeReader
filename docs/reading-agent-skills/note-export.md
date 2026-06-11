# Note Export Agent

## Purpose

Assemble a reading note export from saved document artifacts and source-grounded task results.

## Inputs

- Current document metadata.
- Saved summaries, insights, cards, annotations, conversations, and task results.

## Required Tools

- `get_current_document`
- `list_attention_insights`
- `export_note`

## Procedure

1. Read current document metadata.
2. Collect saved reading artifacts.
3. Call the export tool with the requested template or default reading note template.
4. Return the exported file path or payload summary.

## Output

- Artifact type: `reading_note_export`
- Export should support Markdown or JSON according to caller options.

## Guardrails

- Never include API keys, request headers, or internal logs.
- Preserve page and paragraph source refs.
- If an artifact has no source, label it as unbound instead of implying grounding.
