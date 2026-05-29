import { describe, expect, it, vi } from 'vitest';
import {
    createReadingTools,
    extractText,
    listAnnotations,
    navigatePage,
} from './tools';

describe('reading tools', () => {
    it('extracts bounded text from a document page without changing the document', async () => {
        const document = Object.freeze({
            id: 'doc-1',
            name: 'paper.pdf',
            pages: [
                { page: 1, text: 'First page text.' },
                { page: 2, text: 'Second page has the method section.' },
            ],
        });

        const result = await extractText({ document, page: 2, maxChars: 12 });

        expect(result).toEqual({
            documentId: 'doc-1',
            page: 2,
            text: 'Second page ',
            truncated: true,
            source: 'page',
        });
        expect(document.pages[1].text).toBe('Second page has the method section.');
    });

    it('navigates to a positive page through the provided adapter', async () => {
        const navigateToPage = vi.fn().mockResolvedValue({ currentPage: 3 });

        const result = await navigatePage({ page: 3 }, { navigateToPage });

        expect(navigateToPage).toHaveBeenCalledWith(3);
        expect(result).toEqual({
            page: 3,
            currentPage: 3,
            status: 'navigated',
        });
    });

    it('lists annotations through the provided adapter for the current document', async () => {
        const listAnnotationsForDocument = vi.fn().mockResolvedValue([
            { id: 'annotation-1', documentId: 'doc-1', selectedText: 'Claim' },
        ]);

        const result = await listAnnotations({
            document: { id: 'doc-1' },
        }, {
            listAnnotationsForDocument,
        });

        expect(listAnnotationsForDocument).toHaveBeenCalledWith('doc-1');
        expect(result.annotations).toEqual([
            { id: 'annotation-1', documentId: 'doc-1', selectedText: 'Claim' },
        ]);
    });

    it('creates a registry containing only reading tools', () => {
        const tools = createReadingTools({
            document: { id: 'doc-1', contentText: 'Readable text.' },
        });

        expect(Object.keys(tools)).toEqual(['extractText', 'navigatePage', 'listAnnotations']);
        expect(tools.extractText.readOnly).toBe(true);
        expect(tools.navigatePage.readOnly).toBe(true);
        expect(tools.listAnnotations.readOnly).toBe(true);
    });
});
