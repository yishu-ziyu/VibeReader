import { describe, expect, it } from 'vitest';
import {
    createLocalAttentionRouteModel,
    createLocalPaperOverviewModel,
} from './readingTaskModels';

describe('local reading task models', () => {
    it('builds a paper overview from document metadata and bounded chunks', async () => {
        const model = createLocalPaperOverviewModel();

        await expect(model({ iteration: 1, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'get_current_document',
            args: {},
        });
        await expect(model({ iteration: 2, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'get_document_chunks',
            args: {
                query: 'abstract introduction method results conclusion',
                limit: 4,
                maxChars: 900,
            },
        });

        const result = await model({
            iteration: 3,
            trace: [
                {
                    type: 'tool',
                    toolName: 'get_current_document',
                    result: {
                        id: 'doc-1',
                        documentId: 'doc-1',
                        name: 'paper.pdf',
                        kind: 'pdf',
                        pageCount: 12,
                    },
                },
                {
                    type: 'tool',
                    toolName: 'get_document_chunks',
                    result: {
                        chunks: [
                            {
                                id: 'chunk-1',
                                documentId: 'doc-1',
                                page: 2,
                                paragraphId: 'page-2-para-1',
                                text: 'The abstract states the research problem and contribution.',
                            },
                        ],
                    },
                },
            ],
        });

        expect(result.type).toBe('final');
        expect(result.content).toContain('# Paper overview');
        expect(result.content).toContain('Document: paper.pdf');
        expect(result.content).toContain('p.2: The abstract states the research problem and contribution.');
        expect(result.sourceRefs).toEqual([
            {
                documentId: 'doc-1',
                page: 2,
                paragraphId: 'page-2-para-1',
                text: 'The abstract states the research problem and contribution.',
            },
        ]);
    });

    it('builds an attention route from saved insights and bounded chunks', async () => {
        const model = createLocalAttentionRouteModel();

        await expect(model({ iteration: 1, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'get_current_document',
            args: {},
        });
        await expect(model({ iteration: 2, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'list_attention_insights',
            args: {},
        });
        await expect(model({ iteration: 3, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'get_document_chunks',
            args: {
                query: 'problem claim method evidence result limitation definition formula warning',
                limit: 5,
                maxChars: 800,
            },
        });

        const result = await model({
            iteration: 4,
            trace: [
                {
                    type: 'tool',
                    toolName: 'get_current_document',
                    result: {
                        id: 'doc-1',
                        documentId: 'doc-1',
                        name: 'paper.pdf',
                        kind: 'pdf',
                    },
                },
                {
                    type: 'tool',
                    toolName: 'list_attention_insights',
                    result: {
                        insights: [
                            {
                                id: 'insight-1',
                                documentId: 'doc-1',
                                type: 'Method',
                                description: 'The method section defines the causal identification strategy.',
                                location: {
                                    page: 5,
                                    paragraphId: 'page-5-para-2',
                                },
                            },
                        ],
                    },
                },
                {
                    type: 'tool',
                    toolName: 'get_document_chunks',
                    result: {
                        chunks: [
                            {
                                id: 'chunk-7',
                                documentId: 'doc-1',
                                page: 7,
                                paragraphId: 'page-7-para-1',
                                text: 'The results section reports the main estimate and robustness checks.',
                            },
                        ],
                    },
                },
            ],
        });

        expect(result.type).toBe('final');
        expect(result.content).toContain('# Attention route');
        expect(result.content).toContain('1. P5 · Method: The method section defines the causal identification strategy.');
        expect(result.content).toContain('1. P7: The results section reports the main estimate and robustness checks.');
        expect(result.sourceRefs).toEqual([
            {
                documentId: 'doc-1',
                page: 5,
                paragraphId: 'page-5-para-2',
                text: 'The method section defines the causal identification strategy.',
            },
            {
                documentId: 'doc-1',
                page: 7,
                paragraphId: 'page-7-para-1',
                text: 'The results section reports the main estimate and robustness checks.',
            },
        ]);
    });
});
