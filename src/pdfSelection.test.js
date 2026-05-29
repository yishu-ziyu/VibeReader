import { describe, expect, it } from 'vitest';
import { isInsidePdfAnnotationToolbar } from './pdfSelection';

describe('PDF selection helpers', () => {
    it('preserves the active PDF selection while focus is inside the annotation toolbar', () => {
        document.body.innerHTML = `
            <div class="pdf-annotation-toolbar">
                <input id="note-input" />
            </div>
        `;

        expect(isInsidePdfAnnotationToolbar(document.querySelector('#note-input'))).toBe(true);
    });

    it('does not preserve PDF selection for unrelated focused elements', () => {
        document.body.innerHTML = '<input id="chat-input" />';

        expect(isInsidePdfAnnotationToolbar(document.querySelector('#chat-input'))).toBe(false);
        expect(isInsidePdfAnnotationToolbar(null)).toBe(false);
    });
});

