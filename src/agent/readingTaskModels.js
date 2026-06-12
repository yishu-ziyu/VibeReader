function lastToolResult(trace = [], toolName) {
    return [...trace].reverse().find((entry) => (
        entry?.type === 'tool' && entry.toolName === toolName
    ))?.result || null;
}

function overviewSnippet(text = '', maxLength = 180) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function toolResults(trace = [], toolName) {
    return trace
        .filter((entry) => entry?.type === 'tool' && entry.toolName === toolName)
        .map((entry) => entry.result)
        .filter(Boolean);
}

export function createLocalPaperOverviewModel() {
    return async ({ iteration, trace }) => {
        if (iteration === 1) {
            return {
                type: 'tool_call',
                toolName: 'get_current_document',
                args: {},
            };
        }

        if (iteration === 2) {
            return {
                type: 'tool_call',
                toolName: 'get_document_chunks',
                args: {
                    query: 'abstract introduction method results conclusion',
                    limit: 4,
                    maxChars: 900,
                },
            };
        }

        const metadata = lastToolResult(trace, 'get_current_document') || {};
        const chunkResult = lastToolResult(trace, 'get_document_chunks') || {};
        const chunks = Array.isArray(chunkResult.chunks) ? chunkResult.chunks : [];
        const sourceLines = chunks
            .map((chunk, index) => {
                const location = chunk.page ? `p.${chunk.page}` : chunk.paragraphId || `chunk-${index + 1}`;
                const snippet = overviewSnippet(chunk.text);
                return snippet ? `- ${location}: ${snippet}` : null;
            })
            .filter(Boolean);
        const sourceRefs = chunks
            .map((chunk) => ({
                documentId: chunk.documentId || metadata.id,
                page: chunk.page || null,
                paragraphId: chunk.paragraphId || chunk.id || null,
                text: overviewSnippet(chunk.text, 240),
            }))
            .filter((sourceRef) => sourceRef.paragraphId || sourceRef.page || sourceRef.text);

        return {
            type: 'final',
            content: [
                '# Paper overview',
                '',
                `Document: ${metadata.name || 'Untitled'}`,
                `Type: ${metadata.kind || 'unknown'}`,
                metadata.pageCount ? `Pages: ${metadata.pageCount}` : '',
                '',
                'Initial source scan:',
                sourceLines.length > 0 ? sourceLines.join('\n') : '- No bounded source chunks were available.',
            ].filter(Boolean).join('\n'),
            sourceRefs,
        };
    };
}

export function createLocalAttentionRouteModel() {
    return async ({ iteration, trace }) => {
        if (iteration === 1) {
            return {
                type: 'tool_call',
                toolName: 'get_current_document',
                args: {},
            };
        }

        if (iteration === 2) {
            return {
                type: 'tool_call',
                toolName: 'list_attention_insights',
                args: {},
            };
        }

        if (iteration === 3) {
            return {
                type: 'tool_call',
                toolName: 'get_document_chunks',
                args: {
                    query: 'problem claim method evidence result limitation definition formula warning',
                    limit: 5,
                    maxChars: 800,
                },
            };
        }

        const metadata = lastToolResult(trace, 'get_current_document') || {};
        const insightResult = lastToolResult(trace, 'list_attention_insights') || {};
        const chunkResult = lastToolResult(trace, 'get_document_chunks') || {};
        const insights = Array.isArray(insightResult.insights) ? insightResult.insights : [];
        const chunks = Array.isArray(chunkResult.chunks) ? chunkResult.chunks : [];
        const insightLines = insights
            .slice(0, 5)
            .map((insight, index) => {
                const description = insightDescription(insight);
                const type = insight.type || 'Insight';
                return description ? `${index + 1}. ${insightLocationLabel(insight)} · ${type}: ${description}` : null;
            })
            .filter(Boolean);
        const chunkLines = chunks
            .slice(0, 5)
            .map((chunk, index) => {
                const location = chunk.page ? `P${chunk.page}` : chunk.paragraphId || `chunk-${index + 1}`;
                const snippet = overviewSnippet(chunk.text);
                return snippet ? `${index + 1}. ${location}: ${snippet}` : null;
            })
            .filter(Boolean);
        const sourceRefs = [
            ...insights.map((insight) => ({
                documentId: insight.documentId || metadata.documentId || metadata.id,
                page: insight.location?.page || insight.page || null,
                paragraphId: insight.location?.paragraphId || insight.paragraphId || insight.id || null,
                text: insightDescription(insight),
            })),
            ...chunks.map((chunk) => ({
                documentId: chunk.documentId || metadata.documentId || metadata.id,
                page: chunk.page || null,
                paragraphId: chunk.paragraphId || chunk.id || null,
                text: overviewSnippet(chunk.text, 240),
            })),
        ].filter((sourceRef) => sourceRef.paragraphId || sourceRef.page || sourceRef.text);

        return {
            type: 'final',
            content: [
                '# Attention route',
                '',
                `Document: ${metadata.name || 'Untitled'}`,
                '',
                'Saved attention insights:',
                insightLines.length > 0 ? insightLines.join('\n') : '- No saved attention insights were available.',
                '',
                'Source scan:',
                chunkLines.length > 0 ? chunkLines.join('\n') : '- No bounded source chunks were available.',
            ].join('\n'),
            sourceRefs,
        };
    };
}

export function createLocalCardGenerationModel() {
    return async ({ iteration, trace }) => {
        if (iteration === 1) {
            return {
                type: 'tool_call',
                toolName: 'get_current_document',
                args: {},
            };
        }

        if (iteration === 2) {
            return {
                type: 'tool_call',
                toolName: 'get_document_chunks',
                args: {
                    query: 'problem method evidence result definition contribution limitation',
                    limit: 6,
                    maxChars: 900,
                },
            };
        }

        const metadata = lastToolResult(trace, 'get_current_document') || {};
        const chunkResult = lastToolResult(trace, 'get_document_chunks') || {};
        const candidates = cardCandidateChunks(chunkResult.chunks, metadata);
        const createdResults = toolResults(trace, 'create_vibecard');

        if (createdResults.length === 0 && candidates.length < 3) {
            return {
                type: 'final',
                content: [
                    '# Create VibeCard needs more sources',
                    '',
                    `Document: ${metadata.name || 'Untitled'}`,
                    '',
                    `Need at least 3 source chunks to create VibeCards. Found ${candidates.length}.`,
                    'No VibeCards were created.',
                ].join('\n'),
                sourceRefs: candidates.map((chunk) => ({
                    documentId: chunk.documentId || metadata.documentId || metadata.id,
                    page: chunk.page || null,
                    paragraphId: chunk.paragraphId || chunk.id || null,
                    text: overviewSnippet(chunk.text, 240),
                })).filter((sourceRef) => sourceRef.paragraphId || sourceRef.page || sourceRef.text),
            };
        }

        if (createdResults.length < 3 && candidates[createdResults.length]) {
            return {
                type: 'tool_call',
                toolName: 'create_vibecard',
                args: {
                    card: buildVibeCard(candidates[createdResults.length], createdResults.length, metadata),
                },
            };
        }

        const sourceRefs = createdResults
            .map((result) => result.card || {})
            .map((card) => ({
                documentId: card.documentId || metadata.documentId || metadata.id,
                page: card.page || null,
                paragraphId: card.paragraphId || null,
                text: overviewSnippet(card.sourceText, 240),
            }))
            .filter((sourceRef) => sourceRef.paragraphId || sourceRef.page || sourceRef.text);

        return {
            type: 'final',
            content: [
                '# Created VibeCards',
                '',
                `Document: ${metadata.name || 'Untitled'}`,
                '',
                `Created ${createdResults.length} source-grounded VibeCards.`,
                ...createdResults.map((result, index) => {
                    const card = result.card || {};
                    return `${index + 1}. ${card.title || `VibeCard ${index + 1}`}`;
                }),
            ].join('\n'),
            sourceRefs,
        };
    };
}

function insightLocationLabel(insight = {}) {
    const location = insight.location || {};
    if (location.page) return `P${location.page}`;
    if (insight.page) return `P${insight.page}`;
    return insight.paragraphId || insight.id || 'source';
}

function insightDescription(insight = {}) {
    return String(insight.description || insight.title || insight.text || '').replace(/\s+/g, ' ').trim();
}

function cardCandidateChunks(chunks = [], metadata = {}) {
    const seen = new Set();
    return (Array.isArray(chunks) ? chunks : [])
        .map((chunk) => ({
            ...chunk,
            documentId: chunk.documentId || metadata.documentId || metadata.id,
            text: overviewSnippet(chunk.text, 900),
        }))
        .filter((chunk) => {
            if (!chunk.text) return false;
            const key = chunk.paragraphId || chunk.id || chunk.text;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function buildVibeCard(chunk = {}, index = 0, metadata = {}) {
    const sourceText = overviewSnippet(chunk.text, 900);
    const paragraphId = chunk.paragraphId || chunk.id || null;
    const page = chunk.page || null;
    return {
        documentId: chunk.documentId || metadata.documentId || metadata.id,
        type: 'concept',
        title: `VibeCard ${index + 1}: ${overviewSnippet(sourceText, 64)}`,
        sourceText,
        aiContent: `Review this source-backed point: ${overviewSnippet(sourceText, 220)}`,
        userNote: '',
        page,
        paragraphId,
        tags: ['agent-generated', 'vibecard'],
        source: {
            documentId: chunk.documentId || metadata.documentId || metadata.id,
            page,
            paragraphId,
            selectedText: sourceText,
            sourceType: 'agent-card-generation',
        },
        verificationStatus: sourceText && (page || paragraphId) ? 'grounded' : 'ungrounded',
    };
}
