import type { Title } from "@hooks/useTitlesHook";
import { Icon } from "@iconify/react";

import type { ModulePermission } from "@/lib/rbac";

interface Props {
  open: boolean;
  title: Title | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: (title: Title) => void;
  onCopy: (title: string) => void;
  permissions: ModulePermission;
}

export default function TitleDrawer({
  open,
  title,
  onClose,
  onEdit,
  onDelete,
  onCopy,
  permissions,
}: Props) {
  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/80 transition-opacity duration-200 ${
          open ? "visible opacity-100" : "invisible opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        className={`bg-base-100 fixed top-0 right-0 z-50 flex h-screen w-105 flex-col justify-between overflow-y-auto pt-6 shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
      >
        <section className="px-4">
          <header className="mb-4 flex items-center gap-x-2">
            <article
              className={`grid size-12 place-items-center rounded-md border border-neutral-800/70 p-2 text-neutral-800 ${
                title?.tone || ""
              }`}
            >
              {title?.icon && (
                <Icon icon={`boxicons:${title.icon}`} style={{ fontSize: 22 }} />
              )}
            </article>

            <article className="flex flex-col">
              <h3 className="font-bold">{title?.name || ""}</h3>
              <p className="text-xs opacity-70">{title?.category || ""}</p>
            </article>
          </header>

          {title?.route ? (
            <div>
              <h4 className="bg-base-200/40 rounded-md px-3 py-2 text-xs">
                {title.route}
              </h4>
            </div>
          ) : (
            <p className="text-base-300 text-xs italic">
              Sin ruta en Invgate asignada
            </p>
          )}

          {title?.description && (
            <>
              <div className="divider mt-6 text-xs">Descripción</div>
              <div className="bg-base-200/40 rounded-md p-4 text-sm whitespace-pre-wrap">
                {title.description}
              </div>
            </>
          )}

          {!title?.description && (
            <div className="bg-base-200/40 mt-6 rounded-md p-4 text-sm">
              No hay información relacionada.
            </div>
          )}
        </section>

        <section className="bg-base-200 sticky bottom-0 mt-8 min-h-20 px-4">
          <div className="flex h-full w-full items-center justify-center gap-x-2">
            <button
              className="btn bg-base-300 hover:bg-primary grow shadow-none hover:text-neutral-800"
              onClick={() => title && onCopy(title.name)}
              disabled={!title}
            >
              Copiar título
            </button>

            {permissions.canWrite && (
              <div className="flex">
                <div className="tooltip" data-tip="Editar">
                  <button
                    className="btn btn-ghost shadow-none"
                    onClick={onEdit}
                    disabled={!title}
                  >
                    <Icon icon="boxicons:edit" style={{ fontSize: 22 }} />
                  </button>
                </div>
                <div className="tooltip" data-tip="Eliminar">
                  <button
                    className="btn btn-ghost shadow-none"
                    onClick={() => title && onDelete(title)}
                    disabled={!title}
                  >
                    <Icon icon="boxicons:trash" style={{ fontSize: 22 }} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </aside>
    </>
  );
}
