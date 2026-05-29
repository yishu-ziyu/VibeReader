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
