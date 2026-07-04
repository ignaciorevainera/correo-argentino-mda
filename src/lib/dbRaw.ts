import { db } from "@db/index";

function getClient() {
  return (db as unknown as { $client: import("better-sqlite3").Database }).$client;
}

export function streamQuery<T = Record<string, unknown>>(
  sql: string,
): IterableIterator<T> {
  return getClient().prepare(sql).iterate() as IterableIterator<T>;
}
