import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database("./database/mda.db");

// Custom function to normalize text for accent-insensitive search
sqlite.function("normalize_text", { deterministic: true }, (str: unknown) => {
  if (typeof str !== "string") return str;
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
});

export const db = drizzle(sqlite, { schema });
