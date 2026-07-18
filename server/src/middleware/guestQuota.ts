import { Request, Response, NextFunction } from "express";
import type { Pool } from "pg";
import { config } from "../config/logger.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface GuestQuotaStore {
  getCount(guestId: string): Promise<number>;
  increment(guestId: string): Promise<number>;
}

export class PostgresGuestQuotaStore implements GuestQuotaStore {
  constructor(private pool: Pool) {}

  async getCount(guestId: string): Promise<number> {
    const result = await this.pool.query<{ extract_count: number }>(
      "SELECT extract_count FROM guest_extract_usage WHERE guest_id = $1",
      [guestId]
    );
    return result.rows[0]?.extract_count ?? 0;
  }

  async increment(guestId: string): Promise<number> {
    const result = await this.pool.query<{ extract_count: number }>(
      `INSERT INTO guest_extract_usage (guest_id, extract_count, updated_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (guest_id) DO UPDATE
       SET extract_count = guest_extract_usage.extract_count + 1,
           updated_at = NOW()
       RETURNING extract_count`,
      [guestId]
    );
    return result.rows[0]?.extract_count ?? 1;
  }
}

export class MemoryGuestQuotaStore implements GuestQuotaStore {
  private counts = new Map<string, number>();

  async getCount(guestId: string): Promise<number> {
    return this.counts.get(guestId) ?? 0;
  }

  async increment(guestId: string): Promise<number> {
    const next = (this.counts.get(guestId) ?? 0) + 1;
    this.counts.set(guestId, next);
    return next;
  }
}

function readGuestId(req: Request): string | null {
  const raw = req.headers["x-guest-id"];
  const guestId = Array.isArray(raw) ? raw[0] : raw;
  if (!guestId || !UUID_RE.test(guestId)) {
    return null;
  }
  return guestId;
}

export function createGuestQuotaMiddleware(store: GuestQuotaStore) {
  return async function guestQuotaCheck(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    if (req.user?.id) {
      return next();
    }

    const guestId = readGuestId(req);
    if (!guestId) {
      return res.status(400).json({ error: "X-Guest-Id header is required" });
    }

    const count = await store.getCount(guestId);
    if (count >= config.guestExtractLimit) {
      return res.status(429).json({
        error: "Guest extract limit reached",
        limit: config.guestExtractLimit,
        remaining: 0,
      });
    }

    next();
  };
}

export async function recordGuestExtract(
  store: GuestQuotaStore,
  req: Request
): Promise<void> {
  if (req.user?.id) {
    return;
  }

  const guestId = readGuestId(req);
  if (!guestId) {
    return;
  }

  await store.increment(guestId);
}
