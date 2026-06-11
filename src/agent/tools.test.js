import { describe, expect, it, vi } from 'vitest';
import {
    createReadingTools,
    createAnnotation,
    createVibeCard,
    exportNote,
    extractText,
    getCurrentDocument,
    getDocumentChunks,
    getPageText,
    listAttentionInsights,
    listAnnotations,
    navigatePage,
    searchDocument,
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

    it('returns current document metadata without full document content', async () => {
        const result = await getCurrentDocument({
            document: {
                id: 'doc-1',
                name: 'paper.pdf',
                kind: 'pdf',
                source: 'local-file',
                openedAt: '2026-06-11T10:00:00.000Z',
                parseStatus: 'ready',
                contentText: 'Full paper text should not be exposed here.',
                pages: [
                    { page: 1, text: 'First page text.' },
                    { page: 2, text: 'Second page text.' },
                ],
            },
        });

        expect(result).toEqual({
            documentId: 'doc-1',
            name: 'paper.pdf',
            kind: 'pdf',
            pageCount: 2,
            source: 'local-file',
            openedAt: '2026-06-11T10:00:00.000Z',
            parseStatus: 'ready',
        });
        expect(result).not.toHaveProperty('contentText');
        expect(result).not.toHaveProperty('pages');
    });

    it('gets page text through the PRD tool name', async () => {
        const result = await getPageText({
            document: {
                id: 'doc-1',
                pages: [{ page: 1, text: 'The introduction defines the research problem.' }],
            },
            page: 1,
            maxChars: 20,
        });

        expect(result).toEqual({
            documentId: 'doc-1',
            page: 1,
            text: 'The introduction def',
            truncated: true,
            source: 'page',
        });
    });

    it('searches the current document with bounded source-locatable matches', async () => {
        const result = await searchDocument({
            document: {
                id: 'doc-1',
                pages: [
                    { page: 1, text: 'The introduction frames the claim.' },
                    { page: 2, text: 'The method section explains the claim and evidence.' },
                ],
            },
            query: 'claim evidence',
            maxChars: 18,
        });

        expect(result.documentId).toBe('doc-1');
        expect(result.query).toBe('claim evidence');
        expect(result.matches).toEqual([
            {
                id: 'doc-1-page-2-match-1',
                documentId: 'doc-1',
                page: 2,
                paragraphId: 'page-2',
                text: 'The method section',
                score: 2,
                truncated: true,
            },
            {
                id: 'doc-1-page-1-match-2',
                documentId: 'doc-1',
                page: 1,
                paragraphId: 'page-1',
                text: 'The introduction f',
                score: 1,
                truncated: true,
            },
        ]);
    });

    it('returns document chunks from adapter or local document text', async () => {
        const result = await getDocumentChunks({
            document: {
                id: 'doc-1',
                contentText: 'Problem statement.\n\nMethod details.\n\nResult evidence.',
            },
            query: 'method',
            maxChars: 30,
        });

        expect(result).toEqual({
            documentId: 'doc-1',
            query: 'method',
            chunks: [
                {
                    id: 'doc-1-chunk-2',
                    documentId: 'doc-1',
                    page: null,
                    paragraphId: 'chunk-2',
                    text: 'Method details.',
                    score: 1,
                    truncated: false,
                },
            ],
        });
    });

    it('lists attention insights through the provided adapter for the current document', async () => {
        const listAttentionInsightsForDocument = vi.fn().mockResolvedValue([
            { id: 'insight-1', type: 'Claim', description: 'Core claim', location: { page: 2 } },
        ]);

        const result = await listAttentionInsights({
            document: { id: 'doc-1' },
        }, {
            listAttentionInsightsForDocument,
        });

        expect(listAttentionInsightsForDocument).toHaveBeenCalledWith('doc-1');
        expect(result).toEqual({
            documentId: 'doc-1',
            insights: [
                { id: 'insight-1', type: 'Claim', description: 'Core claim', location: { page: 2 } },
            ],
        });
    });

    it('delegates VibeCard creation to the provided adapter', async () => {
        const createVibeCardAdapter = vi.fn().mockResolvedValue({
            id: 'card-1',
            documentId: 'doc-1',
            type: 'concept',
            title: 'Core concept',
        });

        const result = await createVibeCard({
            document: { id: 'doc-1' },
            card: { type: 'concept', title: 'Core concept' },
        }, {
            createVibeCard: createVibeCardAdapter,
        });

        expect(createVibeCardAdapter).toHaveBeenCalledWith({
            documentId: 'doc-1',
            type: 'concept',
            title: 'Core concept',
        });
        expect(result).toEqual({
            documentId: 'doc-1',
            cardId: 'card-1',
            status: 'created',
            card: {
                id: 'card-1',
                documentId: 'doc-1',
                type: 'concept',
                title: 'Core concept',
            },
        });
    });

    it('requires adapters for write and export tools', async () => {
        await expect(createAnnotation({ document: { id: 'doc-1' } })).rejects.toThrow(
            'create_annotation requires a createAnnotation adapter'
        );
        await expect(exportNote({ document: { id: 'doc-1' } })).rejects.toThrow(
            'export_note requires an exportNote adapter'
        );
    });

    it('creates a registry containing PRD tools and legacy reading aliases', () => {
        const tools = createReadingTools({
            document: { id: 'doc-1', contentText: 'Readable text.' },
        });

        expect(Object.keys(tools)).toEqual([
            'get_current_document',
            'get_document_chunks',
            'get_page_text',
            'search_document',
            'list_attention_insights',
            'create_vibecard',
            'create_annotation',
            'export_note',
            'extractText',
            'navigatePage',
            'listAnnotations',
        ]);
        expect(tools.get_current_document.readOnly).toBe(true);
        expect(tools.get_document_chunks.readOnly).toBe(true);
        expect(tools.get_page_text.readOnly).toBe(true);
        expect(tools.search_document.readOnly).toBe(true);
        expect(tools.list_attention_insights.readOnly).toBe(true);
        expect(tools.create_vibecard.readOnly).toBe(false);
        expect(tools.create_annotation.readOnly).toBe(false);
        expect(tools.export_note.readOnly).toBe(false);
        expect(tools.extractText.readOnly).toBe(true);
        expect(tools.navigatePage.readOnly).toBe(true);
        expect(tools.listAnnotations.readOnly).toBe(true);
    });
});
