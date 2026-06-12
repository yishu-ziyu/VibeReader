import { describe, expect, it } from 'vitest';
import {
    createLocalAttentionRouteModel,
    createLocalCardGenerationModel,
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

    it('creates three source-grounded VibeCards from bounded chunks under load', async () => {
        const model = createLocalCardGenerationModel();
        const trace = [
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
                toolName: 'get_document_chunks',
                result: {
                    chunks: [
                        {
                            id: 'chunk-1',
                            documentId: 'doc-1',
                            page: 1,
                            paragraphId: 'page-1-para-1',
                            text: 'The problem card explains the central research question and motivation.',
                        },
                        {
                            id: 'chunk-2',
                            documentId: 'doc-1',
                            page: 2,
                            paragraphId: 'page-2-para-1',
                            text: 'The method card describes the identification strategy and model design.',
                        },
                        {
                            id: 'chunk-3',
                            documentId: 'doc-1',
                            page: 3,
                            paragraphId: 'page-3-para-1',
                            text: 'The evidence card reports the main empirical result and robustness check.',
                        },
                        {
                            id: 'chunk-4',
                            documentId: 'doc-1',
                            page: 4,
                            paragraphId: 'page-4-para-1',
                            text: 'The limitation card warns about external validity and measurement constraints.',
                        },
                        {
                            id: 'chunk-5',
                            documentId: 'doc-1',
                            page: 5,
                            paragraphId: 'page-5-para-1',
                            text: 'The definition card clarifies a key concept used by the paper.',
                        },
                    ],
                },
            },
        ];

        await expect(model({ iteration: 1, trace: [] })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'get_current_document',
            args: {},
        });
        await expect(model({ iteration: 2, trace })).resolves.toEqual({
            type: 'tool_call',
            toolName: 'get_document_chunks',
            args: {
                query: 'problem method evidence result definition contribution limitation',
                limit: 6,
                maxChars: 900,
            },
        });

        const createCalls = [];
        let currentTrace = [...trace];
        for (let iteration = 3; iteration <= 5; iteration += 1) {
            const response = await model({ iteration, trace: currentTrace });
            createCalls.push(response);
            currentTrace = [
                ...currentTrace,
                {
                    type: 'tool',
                    toolName: 'create_vibecard',
                    args: response.args,
                    result: {
                        status: 'created',
                        cardId: `card-${iteration - 2}`,
                        card: {
                            id: `card-${iteration - 2}`,
                            ...response.args.card,
                        },
                    },
                },
            ];
        }

        expect(createCalls).toHaveLength(3);
        expect(createCalls.every((call) => call.type === 'tool_call')).toBe(true);
        expect(createCalls.every((call) => call.toolName === 'create_vibecard')).toBe(true);
        expect(createCalls.map((call) => call.args.card.paragraphId)).toEqual([
            'page-1-para-1',
            'page-2-para-1',
            'page-3-para-1',
        ]);
        expect(new Set(createCalls.map((call) => call.args.card.sourceText)).size).toBe(3);
        expect(createCalls[0].args.card).toEqual(expect.objectContaining({
            documentId: 'doc-1',
            type: 'concept',
            title: expect.stringContaining('VibeCard 1'),
            sourceText: 'The problem card explains the central research question and motivation.',
            page: 1,
            paragraphId: 'page-1-para-1',
            verificationStatus: 'grounded',
        }));

        const final = await model({ iteration: 6, trace: currentTrace });

        expect(final.type).toBe('final');
        expect(final.content).toContain('# Created VibeCards');
        expect(final.content).toContain('Created 3 source-grounded VibeCards.');
        expect(final.sourceRefs).toEqual([
            {
                documentId: 'doc-1',
                page: 1,
                paragraphId: 'page-1-para-1',
                text: 'The problem card explains the central research question and motivation.',
            },
            {
                documentId: 'doc-1',
                page: 2,
                paragraphId: 'page-2-para-1',
                text: 'The method card describes the identification strategy and model design.',
            },
            {
                documentId: 'doc-1',
                page: 3,
                paragraphId: 'page-3-para-1',
                text: 'The evidence card reports the main empirical result and robustness check.',
            },
        ]);
    });

    it('refuses partial VibeCard creation when fewer than three source chunks are available', async () => {
        const model = createLocalCardGenerationModel();
        const result = await model({
            iteration: 3,
            trace: [
                {
                    type: 'tool',
                    toolName: 'get_current_document',
                    result: {
                        id: 'doc-short',
                        documentId: 'doc-short',
                        name: 'short.md',
                        kind: 'markdown',
                    },
                },
                {
                    type: 'tool',
                    toolName: 'get_document_chunks',
                    result: {
                        chunks: [
                            {
                                id: 'chunk-1',
                                documentId: 'doc-short',
                                page: 1,
                                paragraphId: 'page-1-para-1',
                                text: 'The problem is stated, but there is not enough material.',
                            },
                            {
                                id: 'chunk-2',
                                documentId: 'doc-short',
                                page: 1,
                                paragraphId: 'page-1-para-2',
                                text: 'The method is mentioned briefly.',
                            },
                        ],
                    },
                },
            ],
        });

        expect(result.type).toBe('final');
        expect(result.content).toContain('# Create VibeCard needs more sources');
        expect(result.content).toContain('Need at least 3 source chunks');
        expect(result.content).not.toContain('Created 1');
        expect(result.content).not.toContain('Created 2');
        expect(result.sourceRefs).toEqual([
            {
                documentId: 'doc-short',
                page: 1,
                paragraphId: 'page-1-para-1',
                text: 'The problem is stated, but there is not enough material.',
            },
            {
                documentId: 'doc-short',
                page: 1,
                paragraphId: 'page-1-para-2',
                text: 'The method is mentioned briefly.',
            },
        ]);
    });
});
