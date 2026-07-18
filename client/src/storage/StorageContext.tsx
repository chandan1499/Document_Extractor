import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useAuth } from "../context/AuthContext";
import { GuestQuotaInfo, getGuestQuota } from "./guestQuota";
import { StorageService } from "./types";
import { apiBackend } from "./apiBackend";
import { localStorageBackend } from "./localStorageBackend";
import {
  extractDocumentForUser,
  extractDocumentFromFileForUser,
  readGuestQuota,
} from "./extractService";

interface StorageContextValue {
  storage: StorageService;
  isAuthenticated: boolean;
  guestQuota: GuestQuotaInfo;
  refreshGuestQuota: () => GuestQuotaInfo;
  extractDocument: (text: string, schemaId?: string) => Promise<import("../types/index").ExtractedDocument>;
  extractDocumentFromFile: (
    file: File,
    schemaId?: string
  ) => Promise<import("../types/index").ExtractedDocument>;
}

const StorageContext = createContext<StorageContextValue | null>(null);

export function StorageProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const isAuthenticated = Boolean(session);

  const storage = useMemo(
    () => (isAuthenticated ? apiBackend : localStorageBackend),
    [isAuthenticated]
  );

  const refreshGuestQuota = useCallback(() => getGuestQuota(), []);

  const extractDocument = useCallback(
    (text: string, schemaId?: string) =>
      extractDocumentForUser(text, { schemaId, isAuthenticated }),
    [isAuthenticated]
  );

  const extractDocumentFromFile = useCallback(
    (file: File, schemaId?: string) =>
      extractDocumentFromFileForUser(file, { schemaId, isAuthenticated }),
    [isAuthenticated]
  );

  const value = useMemo<StorageContextValue>(
    () => ({
      storage,
      isAuthenticated,
      guestQuota: readGuestQuota(),
      refreshGuestQuota,
      extractDocument,
      extractDocumentFromFile,
    }),
    [storage, isAuthenticated, refreshGuestQuota, extractDocument, extractDocumentFromFile]
  );

  return (
    <StorageContext.Provider value={value}>{children}</StorageContext.Provider>
  );
}

export function useStorage(): StorageContextValue {
  const ctx = useContext(StorageContext);
  if (!ctx) {
    throw new Error("useStorage must be used within StorageProvider");
  }
  return ctx;
}
