export const SUPPORTED_DOCUMENT_EXTENSIONS = ['pdf', 'md', 'markdown', 'txt', 'html', 'htm'];

const MIME_BY_EXTENSION = {
    pdf: 'application/pdf',
    md: 'text/markdown',
    markdown: 'text/markdown',
    txt: 'text/plain',
    html: 'text/html',
    htm: 'text/html',
};

export function isTauriRuntime() {
    return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

function createDocumentId(source, name) {
    const normalizedName = String(name || 'document').replace(/[^a-z0-9._-]+/gi, '-');
    return `${source}-${Date.now()}-${normalizedName}`;
}

function getFileNameFromPath(path) {
    return String(path || '').split(/[\\/]/).filter(Boolean).pop() || 'untitled';
}

function getExtension(name) {
    const fileName = String(name || '');
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex === -1 || dotIndex === fileName.length - 1) return '';
    return fileName.slice(dotIndex + 1).toLowerCase();
}

export function inferMimeType(name, fallback = '') {
    return fallback || MIME_BY_EXTENSION[getExtension(name)] || 'application/octet-stream';
}

export function inferDocumentKind(name, mimeType = '') {
    const extension = getExtension(name);
    const mime = String(mimeType).toLowerCase();

    if (extension === 'pdf' || mime.includes('pdf')) return 'pdf';
    if (extension === 'md' || extension === 'markdown' || mime.includes('markdown')) return 'markdown';
    if (extension === 'html' || extension === 'htm' || mime.includes('html')) return 'html';
    if (extension === 'txt' || mime.startsWith('text/')) return 'text';

    return 'unknown';
}

export function fileToDocument(file, source = 'browser-upload') {
    if (!file) return null;

    const name = file.name || 'untitled';
    const mimeType = inferMimeType(name, file.type);

    return {
        id: createDocumentId(source, name),
        name,
        kind: inferDocumentKind(name, mimeType),
        source,
        mimeType,
        size: file.size || 0,
        file,
        openedAt: Date.now(),
    };
}

export async function openTauriDocument() {
    if (!isTauriRuntime()) {
        return { status: 'unsupported' };
    }

    const [{ open }, { readFile, readTextFile }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/plugin-fs'),
    ]);

    const selectedPath = await open({
        multiple: false,
        filters: [
            {
                name: 'Readable documents',
                extensions: SUPPORTED_DOCUMENT_EXTENSIONS,
            },
        ],
    });

    if (!selectedPath) {
        return { status: 'cancelled' };
    }

    if (Array.isArray(selectedPath)) {
        return { status: 'cancelled' };
    }

    const name = getFileNameFromPath(selectedPath);
    const mimeType = inferMimeType(name);
    const kind = inferDocumentKind(name, mimeType);

    if (kind === 'pdf') {
        const bytes = await readFile(selectedPath);
        const binary = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes);
        const file = new File([binary], name, { type: mimeType });

        return {
            status: 'opened',
            document: {
                id: createDocumentId('local-file', name),
                name,
                kind,
                source: 'local-file',
                path: selectedPath,
                mimeType,
                size: file.size,
                binary: binary.buffer,
                file,
                openedAt: Date.now(),
            },
        };
    }

    const contentText = await readTextFile(selectedPath);
    const file = new File([contentText], name, { type: mimeType });

    return {
        status: 'opened',
        document: {
            id: createDocumentId('local-file', name),
            name,
            kind,
            source: 'local-file',
            path: selectedPath,
            mimeType,
            size: file.size,
            contentText,
            file,
            openedAt: Date.now(),
        },
    };
}
