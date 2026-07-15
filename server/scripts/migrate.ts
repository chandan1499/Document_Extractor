import dotenv from "dotenv";
import { runMigrations, closePool } from "../src/db/pool.js";

dotenv.config();

async function main() {
  await runMigrations();
  await closePool();
  console.log("Migrations applied successfully");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
