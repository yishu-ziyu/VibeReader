import { describe, expect, it } from 'vitest';
import {
    fileToDocumentWithContent,
    sanitizeHtmlToText,
} from './documentService';

describe('documentService text document support', () => {
    it('reads Markdown files into document contentText', async () => {
        const file = new File(['# Research Note\n\nThis is readable.'], 'note.md', {
            type: 'text/markdown',
        });

        const document = await fileToDocumentWithContent(file);

        expect(document).toEqual(expect.objectContaining({
            name: 'note.md',
            kind: 'markdown',
            contentText: '# Research Note\n\nThis is readable.',
        }));
    });

    it('extracts safe readable text from HTML without script content', () => {
        const text = sanitizeHtmlToText(`
            <html>
                <head><style>body { color: red; }</style></head>
                <body>
                    <h1>Article Title</h1>
                    <script>window.__vibereader_hacked = true;</script>
                    <p onclick="window.__vibereader_hacked = true">First paragraph.</p>
                </body>
            </html>
        `);

        expect(text).toContain('Article Title');
        expect(text).toContain('First paragraph.');
        expect(text).not.toContain('window.__vibereader_hacked');
        expect(text).not.toContain('color: red');
    });
});
