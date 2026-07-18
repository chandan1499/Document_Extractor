import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../config/logger.js";

interface SupabaseJwtPayload {
  sub: string;
  email?: string;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks) {
    if (!config.supabaseUrl) {
      throw new Error("SUPABASE_URL is required for JWT verification");
    }
    jwks = createRemoteJWKSet(
      new URL(
        `${config.supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`
      )
    );
  }
  return jwks;
}

function setUserFromPayload(
  req: Request,
  payload: { sub?: unknown; email?: unknown }
): boolean {
  if (typeof payload.sub !== "string" || !payload.sub) {
    return false;
  }

  req.user = {
    id: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
  return true;
}

async function authenticateRequest(
  req: Request,
  res: Response,
  token: string
): Promise<boolean> {
  if (config.supabaseUrl) {
    try {
      const { payload } = await jwtVerify(token, getJwks());
      if (setUserFromPayload(req, payload)) {
        return true;
      }
      return false;
    } catch {
      // Fall through to legacy HS256 verification for older projects.
    }
  }

  if (!config.supabaseJwtSecret) {
    res.status(500).json({ error: "Auth is not configured" });
    return false;
  }

  try {
    const payload = jwt.verify(
      token,
      config.supabaseJwtSecret
    ) as SupabaseJwtPayload;

    if (!setUserFromPayload(req, payload)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Sets req.user when a valid Bearer token is present; continues without user otherwise. */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next();
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return next();
  }

  if (config.supabaseUrl) {
    try {
      const { payload } = await jwtVerify(token, getJwks());
      if (setUserFromPayload(req, payload)) {
        return next();
      }
    } catch {
      // Fall through to legacy HS256 verification for older projects.
    }
  }

  if (config.supabaseJwtSecret) {
    try {
      const payload = jwt.verify(
        token,
        config.supabaseJwtSecret
      ) as SupabaseJwtPayload;
      setUserFromPayload(req, payload);
    } catch {
      // Ignore invalid tokens for optional auth.
    }
  }

  next();
}

/** Requires a valid JWT and sets req.user. */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const ok = await authenticateRequest(req, res, token);
  if (!ok) {
    if (!res.headersSent) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return;
  }
  next();
}

/** Requires req.user (use after optionalAuth). */
export function requireAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/** Test-only middleware that injects a fixed user without JWT verification. */
export function injectTestUser(userId: string, email?: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: userId, email: email ?? `${userId}@test.local` };
    next();
  };
}
