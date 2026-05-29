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

        expect(isToolAllowed('createAnnotation')).toBe(false);
        expect(isToolAllowed('searchWeb')).toBe(false);
        expect(isToolAllowed('shell')).toBe(false);
    });

    it('filters a tool registry without mutating the original registry', () => {
        const registry = {
            extractText: { name: 'extractText' },
            createAnnotation: { name: 'createAnnotation' },
        };

        const filtered = filterAllowedTools(registry, DEFAULT_READING_PERMISSIONS);

        expect(filtered).toEqual({
            extractText: { name: 'extractText' },
        });
        expect(registry).toHaveProperty('createAnnotation');
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
    });
});
