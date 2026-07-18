import { clearLocalData } from "./keys";
import { getLocalDataBundle } from "./localStorageBackend";
import * as api from "../services/api";

export async function mergeLocalOnLogin(): Promise<void> {
  const bundle = getLocalDataBundle();
  const hasData =
    bundle.documents.length > 0 ||
    bundle.schemas.length > 0 ||
    bundle.corrections.length > 0 ||
    bundle.guidelines.length > 0;

  if (!hasData) {
    return;
  }

  await api.syncLocal(bundle);
  clearLocalData();
}
