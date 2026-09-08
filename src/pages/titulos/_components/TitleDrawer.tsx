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
  if (!title) return null;
  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/80 transition-opacity ${open ? "visible opacity-100" : "invisible opacity-0"} `}
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        className={`bg-base-100 fixed top-0 right-0 z-50 flex h-screen w-105 flex-col justify-between overflow-y-scroll pt-6 shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"} `}
      >
        <section className="px-4">
          <header className="mb-4 flex items-center gap-x-2">
            <article
              className={`grid size-12 place-items-center rounded-md border border-neutral-800/70 p-2 text-neutral-800 ${title.tone}`}
            >
              <Icon icon={`boxicons:${title.icon}`} style={{ fontSize: 22 }} />
            </article>

            <article className="flex flex-col">
              <h3 className="font-bold">{title.name}</h3>
              <p className="text-xs opacity-70">{title.category}</p>
            </article>
          </header>

          {title.route ? (
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

          {title.description && (
            <>
              <div className="divider mt-6 text-xs">Descripción</div>
              <div className="bg-base-200/40 rounded-md p-4 text-sm whitespace-pre-wrap">
                {title.description}
              </div>
            </>
          )}

          {/* {
                        title.articleOnKdb && (
                            <>

                                <div className="divider mt-6 text-xs">Base de conocimientos</div>
                                <a
                                    href={`https://correoargentino.sd.cloud.invgate.net/knowledgebase_articles/show/index/article_id/${title.articleOnKdb}?columns=category%2Cid%2Ccreated_at%2Csolved_requests%2Crating%2Cviews_count%2Clast_view%2Cvisibility%2Cmodified_at%2Cresponsible`}
                                    target="_blank"
                                    className="bg-base-200/40 hover:bg-primary transition-colors p-4 rounded-md flex items-center gap-x-2 cursor-pointer dark:hover:text-neutral-800 fill-base-200/40 hover:fill-white"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" className="size-4">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                                    </svg>
                                    <p className="text-xs font-semibold">{title.articleOnKdb} - Artículo en la base de conocimientos</p>
                                </a>
                            </>
                        )
                            Se deja sin efecto hasta futuras versiones, donde se tratará implementación con Invgate
                    } */}
          {!title.description && !title.articleOnKdb && (
            <div className="bg-base-200/40 mt-6 rounded-md p-4 text-sm">
              No hay información relacionada.
            </div>
          )}
        </section>

        <section className="bg-base-200 sticky bottom-0 mt-8 min-h-20 px-4">
          <div className="flex h-full w-full items-center justify-center gap-x-2">
            <button
              className="btn bg-base-300 hover:bg-primary grow shadow-none hover:text-neutral-800"
              onClick={() => onCopy(title.name)}
            >
              Copiar título
            </button>

            {permissions.canWrite && (
              <div className="flex">
                <div className="tooltip" data-tip="Editar">
                  <button
                    className="btn btn-ghost shadow-none"
                    onClick={onEdit}
                  >
                    <Icon icon="boxicons:edit" style={{ fontSize: 22 }} />
                  </button>
                </div>
                <div className="tooltip" data-tip="Eliminar">
                  <button
                    className="btn btn-ghost shadow-none"
                    onClick={() => onDelete(title)}
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
