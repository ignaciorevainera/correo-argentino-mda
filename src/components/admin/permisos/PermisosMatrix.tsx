import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { getCleanBase } from "@lib/baseUrl";
import { showToast } from "@lib/toastClient";

interface RouteDef {
  id: number;
  path: string;
  label: string;
  sortOrder: number;
}

interface ModuleDef {
  id: number;
  name: string;
  label: string;
  flags: string[];
  sortOrder: number;
}

interface MesaDef {
  id: number;
  name: string;
  displayName: string;
  active: boolean;
  lastSyncedAt: string | null;
}

interface RouteCell {
  routeId: number;
  role: string;
  mesaId: number;
  allowed: boolean;
}

interface ModuleCell {
  moduleId: number;
  role: string;
  mesaId: number;
  canRead: boolean;
  canWrite: boolean;
  canViewAll: boolean;
  canViewComments: boolean;
  canViewTotals: boolean;
}

type ModuleFlags = {
  canRead: boolean;
  canWrite: boolean;
  canViewAll: boolean;
  canViewComments: boolean;
  canViewTotals: boolean;
};

const EDITABLE_ROLES = ["agent", "referent", "team_leader", "supervisor"];
const ROLE_LABELS: Record<string, string> = {
  agent: "Agente",
  referent: "Referente",
  team_leader: "Lider de equipo",
  supervisor: "Supervisor",
};
const ALL_FLAGS: (keyof ModuleFlags)[] = [
  "canRead",
  "canWrite",
  "canViewAll",
  "canViewComments",
  "canViewTotals",
];
const MODULE_FLAGS_DEFAULT: ModuleFlags = {
  canRead: false,
  canWrite: false,
  canViewAll: true,
  canViewComments: true,
  canViewTotals: true,
};

export interface PermisosMatrixProps {
  type: "routes" | "modules";
  routes: RouteDef[];
  modules: ModuleDef[];
  mesas: MesaDef[];
  cells: (RouteCell | ModuleCell)[];
  reload: () => Promise<void>;
}

type CellValue = boolean | ModuleFlags;

function keyOf(id: number, role: string, mesaId: number): string {
  return `${id}:${role}:${mesaId}`;
}

export default function PermisosMatrix(props: PermisosMatrixProps): JSX.Element {
  const { type, routes, modules, mesas, cells, reload } = props;

  const initMap = (): Map<string, CellValue> => {
    const m = new Map<string, CellValue>();
    for (const c of cells) {
      const id = type === "routes" ? (c as RouteCell).routeId : (c as ModuleCell).moduleId;
      const key = keyOf(id, c.role, c.mesaId);
      m.set(
        key,
        type === "routes"
          ? (c as RouteCell).allowed
          : {
              canRead: (c as ModuleCell).canRead,
              canWrite: (c as ModuleCell).canWrite,
              canViewAll: (c as ModuleCell).canViewAll,
              canViewComments: (c as ModuleCell).canViewComments,
              canViewTotals: (c as ModuleCell).canViewTotals,
            },
      );
    }
    return m;
  };

  const [current, setCurrent] = useState<Map<string, CellValue>>(initMap);
  const [snapshot, setSnapshot] = useState<Map<string, CellValue>>(() => new Map(initMap()));
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<Set<number>>(
    () => new Set((type === "routes" ? routes : modules).map((s) => s.id)),
  );

  // Rebuild current/snapshot whenever the source cells change (e.g. after a
  // successful save calls reload(), or when switching tabs). Without this the
  // matrix keeps stale dirty borders and would re-send already-applied changes.
  useEffect(() => {
    const m = initMap();
    setCurrent(m);
    setSnapshot(new Map(m));
    setOpen(new Set((type === "routes" ? routes : modules).map((s) => s.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, type, routes, modules]);

  const activeMesas = useMemo(() => mesas.filter((m) => m.active), [mesas]);
  const inactiveMesas = useMemo(() => mesas.filter((m) => !m.active), [mesas]);

  const sections = useMemo(() => {
    const list = type === "routes" ? routes : modules;
    const q = search.trim().toLowerCase();
    const filtered = q
      ? list.filter((s) => {
          if (type === "routes") {
            const r = s as RouteDef;
            return r.path.toLowerCase().includes(q) || r.label.toLowerCase().includes(q);
          }
          const md = s as ModuleDef;
          return md.name.toLowerCase().includes(q) || md.label.toLowerCase().includes(q);
        })
      : list;
    return [...filtered].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [type, routes, modules, search]);

  const getCell = (id: number, role: string, mesaId: number): CellValue => {
    const v = current.get(keyOf(id, role, mesaId));
    if (type === "routes") return v ?? false;
    return v ?? { ...MODULE_FLAGS_DEFAULT };
  };

  const isDirty = (id: number, role: string, mesaId: number): boolean => {
    const key = keyOf(id, role, mesaId);
    const cur = current.get(key);
    const snap = snapshot.get(key);
    if (type === "routes") return (cur ?? false) !== (snap ?? false);
    return ALL_FLAGS.some(
      (f) => (cur as ModuleFlags | undefined)?.[f] !== ((snap as ModuleFlags | undefined)?.[f] ?? MODULE_FLAGS_DEFAULT[f]),
    );
  };

  const setCell = (
    id: number,
    role: string,
    mesaId: number,
    patch: { allowed?: boolean } | Partial<ModuleFlags>,
  ) => {
    const key = keyOf(id, role, mesaId);
    setCurrent((prev) => {
      const next = new Map(prev);
      if (type === "routes") {
        next.set(key, (patch as { allowed: boolean }).allowed);
      } else {
        const existing = (next.get(key) as ModuleFlags | undefined) ?? { ...MODULE_FLAGS_DEFAULT };
        next.set(key, { ...existing, ...(patch as Partial<ModuleFlags>) });
      }
      return next;
    });
  };

  const diffCount = useMemo(() => {
    let n = 0;
    for (const [key, val] of current.entries()) {
      const snap = snapshot.get(key);
      const isDiff =
        type === "routes"
          ? val !== (snap ?? false)
          : ALL_FLAGS.some(
              (f) => (val as ModuleFlags)[f] !== ((snap as ModuleFlags | undefined)?.[f] ?? MODULE_FLAGS_DEFAULT[f]),
            );
      if (isDiff) n++;
    }
    return n;
  }, [current, snapshot, type]);

  const toggleAll = (openState: boolean) => {
    setOpen(openState ? new Set(sections.map((s) => s.id)) : new Set());
  };

  const toggleSection = (id: number) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function save() {
    if (diffCount === 0 || saving) return;
    setSaving(true);
    try {
      const changes: unknown[] = [];
      for (const [key, val] of current.entries()) {
        const snap = snapshot.get(key);
        const isDiff =
          type === "routes"
            ? val !== (snap ?? false)
            : ALL_FLAGS.some(
                (f) => (val as ModuleFlags)[f] !== ((snap as ModuleFlags | undefined)?.[f] ?? MODULE_FLAGS_DEFAULT[f]),
              );
        if (!isDiff) continue;
        const [idStr, role, mesaIdStr] = key.split(":");
        const id = Number(idStr);
        const mesaId = Number(mesaIdStr);
        if (type === "routes") {
          changes.push({ routeId: id, role, mesaId, allowed: val as boolean });
        } else {
          const flags = val as ModuleFlags;
          changes.push({
            moduleId: id,
            role,
            mesaId,
            flags: {
              canRead: flags.canRead,
              canWrite: flags.canWrite,
              canViewAll: flags.canViewAll,
              canViewComments: flags.canViewComments,
              canViewTotals: flags.canViewTotals,
            },
          });
        }
      }
      const res = await fetch(`${getCleanBase()}api/admin/permisos/${type}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const result = (await res.json()) as { changedCells?: number; message?: string };
      if (!res.ok) throw new Error(result.message || `Error ${res.status}`);
      showToast(`${result.changedCells ?? 0} cambios guardados`, "alert-success");
      await reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error desconocido", "alert-error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-10 bg-base-100/95 backdrop-blur border-b border-base-300 pb-2 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            className="input input-bordered input-sm grow min-w-48"
            placeholder="Buscar ruta o módulo..."
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
          />
          <button className="btn btn-sm" onClick={() => toggleAll(true)}>
            Expandir todo
          </button>
          <button className="btn btn-sm" onClick={() => toggleAll(false)}>
            Contraer todo
          </button>
          <button
            className="btn btn-sm btn-primary"
            disabled={diffCount === 0 || saving}
            onClick={save}
          >
            {saving ? "Guardando..." : `Guardar (${diffCount})`}
          </button>
        </div>
        <div className="alert alert-info mt-2 py-1 text-xs">
          <span>Admin: acceso completo solo en MDA TI (no editable).</span>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {sections.length === 0 && (
          <div className="text-sm text-base-content/60">Sin resultados.</div>
        )}
        {sections.map((section) => {
          const id = section.id;
          const title = type === "routes" ? (section as RouteDef).path : (section as ModuleDef).name;
          const label = section.label;
          const flags = type === "modules" ? (section as ModuleDef).flags : [];
          const isOpen = open.has(id);
          return (
            <div key={id} className="rounded-lg border border-base-300">
              <button
                className="flex w-full items-center justify-between px-3 py-2 text-left"
                onClick={() => toggleSection(id)}
              >
                <span className="font-mono text-sm">{title}</span>
                <span className="text-sm text-base-content/70">
                  {label} {isOpen ? "▾" : "▸"}
                </span>
              </button>
              {isOpen && (
                <div className="overflow-x-auto px-3 pb-3">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th className="font-mono">Rol</th>
                        {activeMesas.map((m) => (
                          <th key={m.id} className="font-mono">
                            {m.displayName}
                          </th>
                        ))}
                        {inactiveMesas.map((m) => (
                          <th key={m.id} className="font-mono opacity-50">
                            {m.displayName} (inactiva)
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {EDITABLE_ROLES.map((role) => (
                        <tr key={role}>
                          <td className="font-mono">{ROLE_LABELS[role] ?? role}</td>
                          {activeMesas.map((m) => {
                            const dirty = isDirty(id, role, m.id);
                            return (
                              <td
                                key={m.id}
                                className={dirty ? "border border-warning" : ""}
                              >
                                {type === "routes" ? (
                                  <input
                                    type="checkbox"
                                    className="checkbox checkbox-sm"
                                    checked={(getCell(id, role, m.id) as boolean) ?? false}
                                    onChange={(e) =>
                                      setCell(id, role, m.id, { allowed: e.target.checked })
                                    }
                                  />
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {flags.map((flag) => {
                                      const fl = flag as keyof ModuleFlags;
                                      const flagsObj = getCell(id, role, m.id) as ModuleFlags;
                                      return (
                                        <input
                                          key={flag}
                                          type="checkbox"
                                          className="checkbox checkbox-xs"
                                          title={flag}
                                          checked={!!flagsObj[fl]}
                                          onChange={(e) =>
                                            setCell(id, role, m.id, { [fl]: e.target.checked })
                                          }
                                        />
                                      );
                                    })}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          {inactiveMesas.map((m) => (
                            <td key={m.id} className="opacity-40">
                              —
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
