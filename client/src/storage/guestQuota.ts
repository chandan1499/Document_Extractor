import { STORAGE_KEYS } from "./keys";

export const GUEST_EXTRACT_LIMIT = 3;

export interface GuestQuotaInfo {
  limit: number;
  used: number;
  remaining: number;
  canExtract: boolean;
}

export function getGuestId(): string {
  const existing = localStorage.getItem(STORAGE_KEYS.guestId);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEYS.guestId, id);
  return id;
}

export function getGuestQuota(): GuestQuotaInfo {
  const used = parseInt(
    localStorage.getItem(STORAGE_KEYS.guestExtractCount) || "0",
    10
  );
  const remaining = Math.max(0, GUEST_EXTRACT_LIMIT - used);
  return {
    limit: GUEST_EXTRACT_LIMIT,
    used,
    remaining,
    canExtract: remaining > 0,
  };
}

export function canGuestExtract(): boolean {
  return getGuestQuota().canExtract;
}

export function recordGuestExtract(): GuestQuotaInfo {
  const used =
    parseInt(localStorage.getItem(STORAGE_KEYS.guestExtractCount) || "0", 10) +
    1;
  localStorage.setItem(STORAGE_KEYS.guestExtractCount, String(used));
  return getGuestQuota();
}

export function syncGuestExtractCount(serverCount: number): void {
  localStorage.setItem(STORAGE_KEYS.guestExtractCount, String(serverCount));
}
