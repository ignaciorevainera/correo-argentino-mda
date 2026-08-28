export function matchesCurrentUser(
  opUsername: string | null | undefined,
  opNombre: string | null | undefined,
  currentUsername: string | null | undefined,
): boolean {
  if (!currentUsername) return false;
  const cur = currentUsername.toLowerCase().trim();
  if (!cur) return false;
  const user = (opUsername || "").toLowerCase().trim();
  const name = (opNombre || "").toLowerCase().trim();
  return user === cur || name === cur;
}
