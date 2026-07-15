import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { config } from "../config/logger.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!config.databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. Create a Supabase project and set DATABASE_URL in your environment."
    );
  }

  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
  }

  return pool;
}

export async function runMigrations(): Promise<void> {
  const db = getPool();
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.join(__dirname, "../../db/schema.sql");
  const schema = await fs.readFile(schemaPath, "utf-8");
  await db.query(schema);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
