import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { listSchemas } from "../services/api";
import { ExtractionSchemaSummary } from "../types/index";
import { useAuth } from "./AuthContext";

interface SchemasContextValue {
  schemas: ExtractionSchemaSummary[];
  loading: boolean;
  error: string | null;
  ensureSchemasLoaded: () => Promise<void>;
  refreshSchemas: () => Promise<void>;
}

const SchemasContext = createContext<SchemasContextValue | null>(null);

export function SchemasProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [schemas, setSchemas] = useState<ExtractionSchemaSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    loadedRef.current = false;
    loadPromiseRef.current = null;
    setSchemas([]);
    setError(null);
    setLoading(false);
  }, [session?.access_token]);

  const fetchSchemas = useCallback(async () => {
    if (!session) {
      setSchemas([]);
      setError(null);
      loadedRef.current = false;
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await listSchemas();
      setSchemas(data);
      loadedRef.current = true;
    } catch (err) {
      setSchemas([]);
      loadedRef.current = false;
      setError(err instanceof Error ? err.message : "Failed to load schemas");
    } finally {
      setLoading(false);
    }
  }, [session]);

  const ensureSchemasLoaded = useCallback(async () => {
    if (!session) return;
    if (loadedRef.current) return;
    if (loadPromiseRef.current) return loadPromiseRef.current;

    const promise = fetchSchemas().finally(() => {
      loadPromiseRef.current = null;
    });
    loadPromiseRef.current = promise;
    return promise;
  }, [session, fetchSchemas]);

  const refreshSchemas = useCallback(async () => {
    loadedRef.current = false;
    loadPromiseRef.current = null;
    await fetchSchemas();
  }, [fetchSchemas]);

  const value = useMemo<SchemasContextValue>(
    () => ({
      schemas,
      loading,
      error,
      ensureSchemasLoaded,
      refreshSchemas,
    }),
    [schemas, loading, error, ensureSchemasLoaded, refreshSchemas]
  );

  return (
    <SchemasContext.Provider value={value}>{children}</SchemasContext.Provider>
  );
}

export function useSchemas(options: { autoLoad?: boolean } = {}) {
  const ctx = useContext(SchemasContext);
  if (!ctx) {
    throw new Error("useSchemas must be used within SchemasProvider");
  }

  const autoLoad = options.autoLoad ?? true;

  useEffect(() => {
    if (autoLoad) {
      void ctx.ensureSchemasLoaded();
    }
  }, [autoLoad, ctx.ensureSchemasLoaded]);

  return ctx;
}
