import * as api from "../services/api";
import { StorageService } from "./types";

export const apiBackend: StorageService = {
  listDocuments: (filters) => api.listDocuments(filters),
  saveDocument: (doc) => api.saveDocument(doc),
  getDocument: async (id) => {
    try {
      return await api.getDocument(id);
    } catch {
      return null;
    }
  },
  listSchemas: () => api.listSchemas(),
  getSchema: (id) => api.getSchema(id),
  saveSchema: (payload) => api.saveSchema(payload),
  deleteSchema: (id) => api.deleteSchema(id),
  proposeSchema: (payload) => api.proposeSchema(payload),
  listGuidelines: (docType) => api.listGuidelines(docType),
  submitCorrectionsBatch: (docId, _docType, _originalText, corrections, learningNotes) =>
    api.submitCorrectionsBatch(docId, corrections, learningNotes).then((result) => ({
      guidelines: (result as { guidelines?: import("../types/index").Guideline[] }).guidelines ?? [],
    })),
};
