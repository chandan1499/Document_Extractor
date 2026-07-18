import {
  Correction,
  ExtractedDocument,
  ExtractionSchema,
  ExtractionSchemaSummary,
  FieldDefinition,
  Guideline,
  PaginatedResult,
  ProposedSchemaDraft,
} from "../types/index";

export interface DocumentFilters {
  page?: number;
  limit?: number;
  type?: string;
  q?: string;
  [key: string]: unknown;
}

export interface StorageService {
  listDocuments(filters?: DocumentFilters): Promise<PaginatedResult<ExtractedDocument>>;
  saveDocument(doc: ExtractedDocument): Promise<ExtractedDocument>;
  getDocument(id: string): Promise<ExtractedDocument | null>;
  listSchemas(): Promise<ExtractionSchemaSummary[]>;
  getSchema(id: string): Promise<ExtractionSchema | null>;
  saveSchema(payload: {
    id?: string;
    name: string;
    description?: string;
    fieldDefinitions: FieldDefinition[];
    prompt?: string;
  }): Promise<ExtractionSchema>;
  deleteSchema(id: string): Promise<void>;
  proposeSchema(payload: {
    sampleText: string;
    name?: string;
    description?: string;
  }): Promise<ProposedSchemaDraft>;
  submitCorrectionsBatch(
    docId: string,
    docType: string,
    originalText: string,
    corrections: Array<{
      field: string;
      originalValue: unknown;
      correctedValue: unknown;
    }>,
    learningNotes?: string
  ): Promise<{ guidelines: Guideline[] }>;
  listGuidelines(docType?: string): Promise<Guideline[]>;
}

export interface LocalDataBundle {
  documents: ExtractedDocument[];
  schemas: ExtractionSchema[];
  corrections: Correction[];
  guidelines: Guideline[];
}
