export const STORAGE_PREFIX = "doc-extraction:v1";

export const STORAGE_KEYS = {
  documents: `${STORAGE_PREFIX}:documents`,
  schemas: `${STORAGE_PREFIX}:schemas`,
  corrections: `${STORAGE_PREFIX}:corrections`,
  guidelines: `${STORAGE_PREFIX}:guidelines`,
  guestId: `${STORAGE_PREFIX}:guestId`,
  guestExtractCount: `${STORAGE_PREFIX}:guestExtractCount`,
} as const;

export function clearLocalData(): void {
  localStorage.removeItem(STORAGE_KEYS.documents);
  localStorage.removeItem(STORAGE_KEYS.schemas);
  localStorage.removeItem(STORAGE_KEYS.corrections);
  localStorage.removeItem(STORAGE_KEYS.guidelines);
}
