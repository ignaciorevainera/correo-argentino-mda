import type { JSX } from "react";

export interface PermisosShellProps {
  currentUser: { username: string; mesaId: number | null };
}

export default function PermisosShell(_props: PermisosShellProps): JSX.Element {
  return <div>Loading...</div>;
}
