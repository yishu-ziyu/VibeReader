import { create } from 'zustand';

export const useDocumentStore = create((set, get) => ({
  documents: [],
  activeDocumentId: null,
  currentDocument: null,

  addDocument: (document) => {
    if (!document) return;

    set((state) => {
      const existingIndex = state.documents.findIndex((item) => item.id === document.id);
      const documents =
        existingIndex === -1
          ? [document, ...state.documents]
          : state.documents.map((item, index) => (index === existingIndex ? document : item));

      return {
        documents,
        activeDocumentId: document.id,
        currentDocument: document,
      };
    });
  },

  setActiveDocument: (documentId) => {
    const document = get().documents.find((item) => item.id === documentId) || null;
    set({
      activeDocumentId: document ? document.id : null,
      currentDocument: document,
    });
  },

  clearDocuments: () =>
    set({
      documents: [],
      activeDocumentId: null,
      currentDocument: null,
    }),
}));
