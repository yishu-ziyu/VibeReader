export function isInsidePdfAnnotationToolbar(element) {
    return Boolean(element?.closest?.('.pdf-annotation-toolbar'));
}

