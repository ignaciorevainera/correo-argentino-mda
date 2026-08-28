import { useState } from "react";
import type { JSX } from "react";
import { getCleanBase } from "@lib/baseUrl";
import { showToast } from "@lib/toastClient";

interface Mesa {
  id: number;
  invgateId: string;
  name: string;
  displayName: string | null;
  active: boolean;
  lastSyncedAt: string | null;
}

interface MesasTabProps {
  mesas: Mesa[];
  reload: () => Promise<void>;
}

export default function MesasTab({ mesas, reload }: MesasTabProps): JSX.Element {
  const [syncing, setSyncing] = useState(false);

  const sorted = [...mesas].sort((a, b) => a.name.localeCompare(b.name));
  const lastSync = sorted[0]?.lastSyncedAt;

  async function sync(): Promise<void> {
    setSyncing(true);
    try {
      const res = await fetch(getCleanBase() + "api/admin/permisos/mesas/sync", {
        method: "POST",
        credentials: "same-origin",
      });
      if (res.ok) {
        showToast("Mesas sincronizadas", "alert-success");
        await reload();
      } else {
        const err = await res.json().catch(() => null);
        showToast(err?.message ?? "Error al sincronizar mesas", "alert-error");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      showToast(message, "alert-error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row items-center gap-4">
        <button className="btn btn-primary" onClick={sync} disabled={syncing}>
          {syncing ? "Sincronizando..." : "Sincronizar desde InvGate"}
        </button>
        {lastSync && (
          <span>Ultima sincronizacion: {new Date(lastSync).toLocaleString()}</span>
        )}
      </div>

      <table className="table table-zebra">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Display</th>
            <th>InvGate ID</th>
            <th>Activa</th>
            <th>Sincronizado</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center">
                No hay mesas. Haz clic en Sincronizar desde InvGate para empezar.
              </td>
            </tr>
          ) : (
            sorted.map((mesa) => (
              <tr className={mesa.active ? "" : "opacity-50"}>
                <td className="font-mono">{mesa.name}</td>
                <td>{mesa.displayName ?? "—"}</td>
                <td>{mesa.invgateId}</td>
                <td>{mesa.active ? "Si" : "No"}</td>
                <td>
                  {mesa.lastSyncedAt
                    ? new Date(mesa.lastSyncedAt).toLocaleString()
                    : "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
