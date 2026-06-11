function positivePage(page) {
    const pageNumber = Number(page);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
        throw new Error('A positive page number is required');
    }
    return pageNumber;
}

function pageTextFromDocument(document = {}, page) {
    if (!Array.isArray(document.pages)) return '';

    const pageNumber = positivePage(page);
    const match = document.pages.find((entry, index) => {
        if (typeof entry === 'string') return index + 1 === pageNumber;
        return (entry.page || index + 1) === pageNumber;
    });

    if (typeof match === 'string') return match;
    return match?.text || '';
}

function fullDocumentText(document = {}) {
    if (document.contentText) return String(document.contentText);
    if (document.text) return String(document.text);
    if (!Array.isArray(document.pages)) return '';

    return document.pages
        .map((entry) => (typeof entry === 'string' ? entry : entry.text || ''))
        .filter(Boolean)
        .join('\n\n');
}

function boundedText(text, maxChars) {
    const normalized = String(text || '');
    const limit = Number(maxChars);

    if (!Number.isFinite(limit) || limit < 1 || normalized.length <= limit) {
        return {
            text: normalized,
            truncated: false,
        };
    }

    return {
        text: normalized.slice(0, limit),
        truncated: true,
    };
}

function currentDocumentMetadata(document = {}, args = {}) {
    const pages = Array.isArray(document.pages) ? document.pages.length : null;
    const pageCount = Number.isInteger(document.pageCount)
        ? document.pageCount
        : Number.isInteger(document.pdfPages)
            ? document.pdfPages
            : pages;

    return Object.freeze({
        documentId: args.documentId || document.id || 'current-document',
        name: document.name || document.title || 'Untitled',
        kind: document.kind || document.type || 'unknown',
        pageCount,
        source: document.source || null,
        openedAt: document.openedAt || null,
        parseStatus: document.parseStatus || null,
    });
}

function queryTokens(query) {
    return String(query || '')
        .toLowerCase()
        .split(/[\s,.;:!?()[\]{}"'`]+/)
        .map((token) => token.trim())
        .filter(Boolean);
}

function scoreText(text, tokens) {
    const normalized = String(text || '').toLowerCase();
    return tokens.reduce((score, token) => (
        normalized.includes(token) ? score + 1 : score
    ), 0);
}

function freezeMatch(match) {
    return Object.freeze({
        id: match.id,
        documentId: match.documentId,
        page: match.page,
        paragraphId: match.paragraphId,
        text: match.text,
        score: match.score,
        truncated: match.truncated,
    });
}

function localSearchMatches(document = {}, query, options = {}) {
    const tokens = queryTokens(query);
    if (tokens.length === 0) return [];

    const documentId = options.documentId || document.id || 'current-document';
    const maxChars = options.maxChars;
    const pageEntries = Array.isArray(document.pages)
        ? document.pages.map((entry, index) => ({
            page: typeof entry === 'string' ? index + 1 : entry.page || index + 1,
            paragraphId: typeof entry === 'string'
                ? `page-${index + 1}`
                : entry.paragraphId || `page-${entry.page || index + 1}`,
            text: typeof entry === 'string' ? entry : entry.text || '',
        }))
        : fullDocumentText(document)
            .split(/\n{2,}/)
            .map((text, index) => ({
                page: null,
                paragraphId: `chunk-${index + 1}`,
                text,
            }));

    return pageEntries
        .map((entry, index) => {
            const score = scoreText(entry.text, tokens);
            if (score < 1) return null;

            const result = boundedText(entry.text, maxChars);
            return {
                id: `${documentId}-${entry.paragraphId}-match-${index + 1}`,
                documentId,
                page: entry.page,
                paragraphId: entry.paragraphId,
                text: result.text,
                score,
                truncated: result.truncated,
                order: index,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .map((match, index) => ({
            ...match,
            id: `${documentId}-${match.paragraphId}-match-${index + 1}`,
        }));
}

function localDocumentChunks(document = {}, query, options = {}) {
    const tokens = queryTokens(query);
    const documentId = options.documentId || document.id || 'current-document';
    const paragraphs = fullDocumentText(document)
        .split(/\n{2,}/)
        .map((text) => text.trim())
        .filter(Boolean);

    return paragraphs
        .map((text, index) => {
            const score = tokens.length ? scoreText(text, tokens) : 1;
            if (score < 1) return null;

            const result = boundedText(text, options.maxChars);
            return {
                id: `${documentId}-chunk-${index + 1}`,
                documentId,
                page: null,
                paragraphId: `chunk-${index + 1}`,
                text: result.text,
                score,
                truncated: result.truncated,
                order: index,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.order - b.order);
}

export async function extractText(args = {}, adapters = {}) {
    const document = args.document || adapters.document || {};
    const documentId = document.id || args.documentId || adapters.documentId || 'current-document';
    const hasPage = args.page !== undefined && args.page !== null;
    const page = hasPage ? positivePage(args.page) : null;

    const rawText = hasPage && adapters.getPageText
        ? await adapters.getPageText(page)
        : hasPage
            ? pageTextFromDocument(document, page)
            : fullDocumentText(document);
    const result = boundedText(rawText, args.maxChars);

    return Object.freeze({
        documentId,
        page,
        text: result.text,
        truncated: result.truncated,
        source: hasPage ? 'page' : 'document',
    });
}

export async function getCurrentDocument(args = {}, adapters = {}) {
    if (adapters.getCurrentDocument) {
        const metadata = await adapters.getCurrentDocument(args.documentId);
        return currentDocumentMetadata(metadata || {}, {
            documentId: metadata?.documentId || metadata?.id || args.documentId,
        });
    }

    const document = args.document || adapters.document || {};
    return currentDocumentMetadata(document, args);
}

export async function getPageText(args = {}, adapters = {}) {
    return extractText(args, adapters);
}

export async function searchDocument(args = {}, adapters = {}) {
    const document = args.document || adapters.document || {};
    const documentId = args.documentId || document.id || adapters.documentId || 'current-document';
    const query = String(args.query || '').trim();

    if (!query) {
        return Object.freeze({
            documentId,
            query,
            matches: Object.freeze([]),
        });
    }

    const matches = adapters.searchDocument
        ? await adapters.searchDocument({
            documentId,
            query,
            limit: args.limit,
            maxChars: args.maxChars,
        })
        : localSearchMatches(document, query, {
            documentId,
            maxChars: args.maxChars,
        });

    const limit = Number(args.limit);
    const boundedMatches = Number.isFinite(limit) && limit > 0
        ? matches.slice(0, limit)
        : matches;

    return Object.freeze({
        documentId,
        query,
        matches: Object.freeze(boundedMatches.map(freezeMatch)),
    });
}

export async function getDocumentChunks(args = {}, adapters = {}) {
    const document = args.document || adapters.document || {};
    const documentId = args.documentId || document.id || adapters.documentId || 'current-document';
    const query = String(args.query || '').trim();

    const chunks = adapters.getDocumentChunks
        ? await adapters.getDocumentChunks({
            documentId,
            query,
            limit: args.limit,
            maxChars: args.maxChars,
        })
        : localDocumentChunks(document, query, {
            documentId,
            maxChars: args.maxChars,
        });

    const limit = Number(args.limit);
    const boundedChunks = Number.isFinite(limit) && limit > 0
        ? chunks.slice(0, limit)
        : chunks;

    return Object.freeze({
        documentId,
        query,
        chunks: Object.freeze(boundedChunks.map(freezeMatch)),
    });
}

export async function listAttentionInsights(args = {}, adapters = {}) {
    const document = args.document || adapters.document || {};
    const documentId = args.documentId || document.id || adapters.documentId;

    if (!documentId) {
        return Object.freeze({
            documentId: null,
            insights: Object.freeze([]),
        });
    }

    const insights = adapters.listAttentionInsightsForDocument
        ? await adapters.listAttentionInsightsForDocument(documentId)
        : [];

    return Object.freeze({
        documentId,
        insights: Object.freeze([...(insights || [])]),
    });
}

function documentIdFromArgs(args = {}, adapters = {}) {
    const document = args.document || adapters.document || {};
    return args.documentId || document.id || adapters.documentId;
}

export async function createVibeCard(args = {}, adapters = {}) {
    if (!adapters.createVibeCard) {
        throw new Error('create_vibecard requires a createVibeCard adapter');
    }

    const documentId = documentIdFromArgs(args, adapters);
    const cardInput = {
        documentId,
        ...(args.card || {}),
    };
    const card = await adapters.createVibeCard(cardInput);

    return Object.freeze({
        documentId,
        cardId: card?.id || null,
        status: 'created',
        card: Object.freeze({ ...(card || {}) }),
    });
}

export async function createAnnotation(args = {}, adapters = {}) {
    if (!adapters.createAnnotation) {
        throw new Error('create_annotation requires a createAnnotation adapter');
    }

    const documentId = documentIdFromArgs(args, adapters);
    const annotationInput = {
        documentId,
        ...(args.annotation || {}),
    };
    const annotation = await adapters.createAnnotation(annotationInput);

    return Object.freeze({
        documentId,
        annotationId: annotation?.id || null,
        status: 'created',
        annotation: Object.freeze({ ...(annotation || {}) }),
    });
}

export async function exportNote(args = {}, adapters = {}) {
    if (!adapters.exportNote) {
        throw new Error('export_note requires an exportNote adapter');
    }

    const documentId = documentIdFromArgs(args, adapters);
    const exportResult = await adapters.exportNote({
        documentId,
        template: args.template || 'default',
        format: args.format || 'markdown',
    });

    return Object.freeze({
        documentId,
        status: 'exported',
        export: Object.freeze({ ...(exportResult || {}) }),
    });
}

export async function navigatePage(args = {}, adapters = {}) {
    const page = positivePage(args.page);

    if (!adapters.navigateToPage) {
        return Object.freeze({
            page,
            currentPage: page,
            status: 'navigation-unavailable',
        });
    }

    const result = await adapters.navigateToPage(page);
    return Object.freeze({
        page,
        currentPage: result?.currentPage || page,
        status: 'navigated',
    });
}

export async function listAnnotations(args = {}, adapters = {}) {
    const document = args.document || adapters.document || {};
    const documentId = args.documentId || document.id || adapters.documentId;

    if (!documentId) {
        return Object.freeze({
            documentId: null,
            annotations: Object.freeze([]),
        });
    }

    const annotations = adapters.listAnnotationsForDocument
        ? await adapters.listAnnotationsForDocument(documentId)
        : [];

    return Object.freeze({
        documentId,
        annotations: Object.freeze([...(annotations || [])]),
    });
}

function withBaseContext(baseContext, args) {
    return Object.freeze({
        ...baseContext,
        ...args,
        document: args.document || baseContext.document,
    });
}

export function createReadingTools(baseContext = {}, adapters = {}) {
    return Object.freeze({
        get_current_document: Object.freeze({
            name: 'get_current_document',
            description: 'Return safe metadata for the current document without full content.',
            readOnly: true,
            run: (args = {}) => getCurrentDocument(withBaseContext(baseContext, args), adapters),
        }),
        get_document_chunks: Object.freeze({
            name: 'get_document_chunks',
            description: 'Return bounded, source-locatable chunks from the current document.',
            readOnly: true,
            run: (args = {}) => getDocumentChunks(withBaseContext(baseContext, args), adapters),
        }),
        get_page_text: Object.freeze({
            name: 'get_page_text',
            description: 'Extract bounded text from one page of the current document.',
            readOnly: true,
            run: (args = {}) => getPageText(withBaseContext(baseContext, args), adapters),
        }),
        search_document: Object.freeze({
            name: 'search_document',
            description: 'Search the current document and return bounded source matches.',
            readOnly: true,
            run: (args = {}) => searchDocument(withBaseContext(baseContext, args), adapters),
        }),
        list_attention_insights: Object.freeze({
            name: 'list_attention_insights',
            description: 'List saved attention insights for the current document.',
            readOnly: true,
            run: (args = {}) => listAttentionInsights(withBaseContext(baseContext, args), adapters),
        }),
        create_vibecard: Object.freeze({
            name: 'create_vibecard',
            description: 'Create a source-bound VibeCard through the local persistence adapter.',
            readOnly: false,
            run: (args = {}) => createVibeCard(withBaseContext(baseContext, args), adapters),
        }),
        create_annotation: Object.freeze({
            name: 'create_annotation',
            description: 'Create a source-bound annotation through the local persistence adapter.',
            readOnly: false,
            run: (args = {}) => createAnnotation(withBaseContext(baseContext, args), adapters),
        }),
        export_note: Object.freeze({
            name: 'export_note',
            description: 'Export the current document reading note through the local export adapter.',
            readOnly: false,
            run: (args = {}) => exportNote(withBaseContext(baseContext, args), adapters),
        }),
        extractText: Object.freeze({
            name: 'extractText',
            description: 'Extract bounded text from the current document or a specific page.',
            readOnly: true,
            run: (args = {}) => extractText(withBaseContext(baseContext, args), adapters),
        }),
        navigatePage: Object.freeze({
            name: 'navigatePage',
            description: 'Move the reader UI to a specific page without modifying the document.',
            readOnly: true,
            run: (args = {}) => navigatePage(withBaseContext(baseContext, args), adapters),
        }),
        listAnnotations: Object.freeze({
            name: 'listAnnotations',
            description: 'List local annotations for the current document.',
            readOnly: true,
            run: (args = {}) => listAnnotations(withBaseContext(baseContext, args), adapters),
        }),
    });
}
