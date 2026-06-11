import { describe, expect, it } from 'vitest';
import {
    DEFAULT_READING_PERMISSIONS,
    assertToolAllowed,
    filterAllowedTools,
    isToolAllowed,
} from './permissions';

describe('agent permissions', () => {
    it('allows only reading tools by default', () => {
        expect(isToolAllowed('extractText')).toBe(true);
        expect(isToolAllowed('navigatePage')).toBe(true);
        expect(isToolAllowed('listAnnotations')).toBe(true);
        expect(isToolAllowed('get_current_document')).toBe(true);
        expect(isToolAllowed('get_page_text')).toBe(true);
        expect(isToolAllowed('search_document')).toBe(true);
        expect(isToolAllowed('get_document_chunks')).toBe(true);
        expect(isToolAllowed('list_attention_insights')).toBe(true);

        expect(isToolAllowed('createAnnotation')).toBe(false);
        expect(isToolAllowed('create_vibecard')).toBe(false);
        expect(isToolAllowed('create_annotation')).toBe(false);
        expect(isToolAllowed('export_note')).toBe(false);
        expect(isToolAllowed('searchWeb')).toBe(false);
        expect(isToolAllowed('shell')).toBe(false);
    });

    it('filters a tool registry without mutating the original registry', () => {
        const registry = {
            extractText: { name: 'extractText' },
            list_attention_insights: { name: 'list_attention_insights' },
            create_vibecard: { name: 'create_vibecard' },
            createAnnotation: { name: 'createAnnotation' },
            create_annotation: { name: 'create_annotation' },
            export_note: { name: 'export_note' },
        };

        const filtered = filterAllowedTools(registry, DEFAULT_READING_PERMISSIONS);

        expect(filtered).toEqual({
            extractText: { name: 'extractText' },
            list_attention_insights: { name: 'list_attention_insights' },
        });
        expect(registry).toHaveProperty('createAnnotation');
        expect(registry).toHaveProperty('create_vibecard');
        expect(registry).toHaveProperty('export_note');
        expect(filtered).not.toBe(registry);
    });

    it('throws a clear permission error for disallowed tools', () => {
        expect(() => assertToolAllowed('createAnnotation')).toThrow(
            'Tool "createAnnotation" is not allowed'
        );
    });

    it('honors tool-specific permission flags in addition to the allowed tool list', () => {
        expect(isToolAllowed('extractText', {
            ...DEFAULT_READING_PERMISSIONS,
            canReadDocument: false,
        })).toBe(false);

        expect(isToolAllowed('navigatePage', {
            ...DEFAULT_READING_PERMISSIONS,
            canNavigate: false,
        })).toBe(false);

        expect(isToolAllowed('listAnnotations', {
            ...DEFAULT_READING_PERMISSIONS,
            canListAnnotations: false,
        })).toBe(false);

        expect(isToolAllowed('search_document', {
            ...DEFAULT_READING_PERMISSIONS,
            canSearchDocument: false,
        })).toBe(false);
    });

    it('requires explicit allowed tool names and write flags for mutation tools', () => {
        expect(isToolAllowed('create_vibecard', {
            ...DEFAULT_READING_PERMISSIONS,
            allowedTools: ['create_vibecard'],
        })).toBe(false);

        expect(isToolAllowed('create_vibecard', {
            ...DEFAULT_READING_PERMISSIONS,
            allowedTools: ['create_vibecard'],
            canWriteVibeCards: true,
        })).toBe(true);

        expect(isToolAllowed('export_note', {
            ...DEFAULT_READING_PERMISSIONS,
            allowedTools: ['export_note'],
            canExportNotes: true,
        })).toBe(true);
    });
});
