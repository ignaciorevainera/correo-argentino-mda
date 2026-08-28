import { useEffect, useState } from "react";
import type { JSX } from "react";
import { getCleanBase } from "@lib/baseUrl";
import PermisosMatrix from "./PermisosMatrix";
import MesasTab from "./MesasTab";

export interface PermisosShellProps {
  currentUser: { username: string; mesaId: number | null };
}

interface PermisosData {
  routes: unknown[];
  modules: unknown[];
  mesas: unknown[];
  routeAccess: unknown[];
  moduleAccess: unknown[];
}

type Tab = "rutas" | "modulos" | "mesas";

export default function PermisosShell(_props: PermisosShellProps): JSX.Element {
  const [tab, setTab] = useState<Tab>("rutas");
  const [data, setData] = useState<PermisosData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getCleanBase()}api/admin/permisos/data`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        throw new Error(`Error ${res.status} al cargar permisos`);
      }
      const json = (await res.json()) as PermisosData;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      throw e;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch {
        return;
      }
      if (data && data.mesas.length === 0) {
        try {
          await fetch(`${getCleanBase()}api/admin/permisos/mesas/sync`, {
            method: "POST",
            credentials: "same-origin",
          });
          await load();
        } catch {
          // non-fatal
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !data) {
    return <div className="skeleton h-96 w-full" />;
  }

  if (error) {
    return (
      <div className="alert alert-error">
        <span>{error}</span>
        <button className="btn btn-sm" onClick={() => load()}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) {
    return <div className="skeleton h-96 w-full" />;
  }

  return (
    <div>
      <div role="tablist" className="tabs tabs-bordered">
        <button
          role="tab"
          className={`tab ${tab === "rutas" ? "tab-active" : ""}`}
          onClick={() => setTab("rutas")}
        >
          Rutas
        </button>
        <button
          role="tab"
          className={`tab ${tab === "modulos" ? "tab-active" : ""}`}
          onClick={() => setTab("modulos")}
        >
          Módulos
        </button>
        <button
          role="tab"
          className={`tab ${tab === "mesas" ? "tab-active" : ""}`}
          onClick={() => setTab("mesas")}
        >
          Mesas
        </button>
      </div>

      <div className="mt-4">
        {tab === "rutas" && (
          <PermisosMatrix
            type="routes"
            routes={data.routes}
            modules={data.modules}
            mesas={data.mesas}
            cells={data.routeAccess}
            reload={load}
          />
        )}
        {tab === "modulos" && (
          <PermisosMatrix
            type="modules"
            routes={data.routes}
            modules={data.modules}
            mesas={data.mesas}
            cells={data.moduleAccess}
            reload={load}
          />
        )}
        {tab === "mesas" && <MesasTab mesas={data.mesas} reload={load} />}
      </div>
    </div>
  );
}
