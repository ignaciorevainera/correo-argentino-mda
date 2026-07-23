export function extractUsersArray(rawData: unknown): unknown[] {
  if (Array.isArray(rawData)) return rawData;

  if (rawData && typeof rawData === "object") {
    const obj = rawData as Record<string, unknown>;

    const candidate =
      (Array.isArray((obj as any)?.data?.users) ? (obj as any).data.users : undefined) ??
      (Array.isArray(obj.users) ? obj.users : undefined) ??
      (Array.isArray(obj.data) ? obj.data : undefined);

    if (candidate) return candidate;
  }

  return [];
}
