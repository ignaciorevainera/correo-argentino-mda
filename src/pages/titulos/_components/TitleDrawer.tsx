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
    open, title, onClose, onEdit, onDelete, onCopy,
    permissions
}: Props) {

    if (!title) return null;
    return (
        <>
            {/* Overlay */}
            <div
                className={`
                    fixed inset-0 bg-black/80 z-40 transition-opacity
                    ${open ? "opacity-100 visible" : "opacity-0 invisible"}
                `}
                onClick={onClose}
            />
            {/* Drawer */}
            <aside
                className={`fixed flex flex-col justify-between top-0 right-0 h-screen w-105 bg-base-100 z-50 shadow-2xl transition-transform duration-300  pt-6 overflow-y-scroll
                ${open ? "translate-x-0" : "translate-x-full"}    
                `}
            >
                <section className="px-4">
                    <header className="flex items-center gap-x-2 mb-4">
                        <article className={`grid size-12 place-items-center p-2 rounded-md border border-neutral-800/70 text-neutral-800 ${title.tone}`}>
                            <Icon
                                icon={`boxicons:${title.icon}`}
                                style={{ fontSize: 22 }}
                            />
                        </article>

                        <article className="flex flex-col">
                            <h3 className="font-bold">
                                {title.name}
                            </h3>
                            <p className="text-xs opacity-70">
                                {title.category}
                            </p>
                        </article>
                    </header>

                    {
                        title.route ? (
                            <div >
                                <h4 className="bg-base-200/40 px-3 py-2 rounded-md text-xs">
                                    {title.route}
                                </h4>
                            </div>
                        )
                            :
                            <p className="text-xs italic text-base-300">
                                Sin ruta en Invgate asignada
                            </p>
                    }

                    {
                        title.description && (
                            <>
                                <div className="divider mt-6 text-xs">Descripción</div>
                                <div className=" bg-base-200/40 p-4 text-sm rounded-md whitespace-pre-wrap">
                                    {title.description}
                                </div>
                            </>
                        )
                    }


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
                        <div className="mt-6 bg-base-200/40 p-4 text-sm rounded-md">
                            No hay información relacionada.
                        </div>
                    )}
                </section>


                <section className="sticky bottom-0 mt-8 min-h-20 bg-base-200 px-4">

                    <div className="flex justify-center items-center h-full w-full gap-x-2">
                        <button
                            className="btn shadow-none bg-base-300 hover:bg-primary hover:text-neutral-800 grow"
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
                                        <Icon
                                            icon="boxicons:edit"
                                            style={{ fontSize: 22 }}
                                        />
                                    </button>
                                </div>
                                <div className="tooltip" data-tip="Eliminar">
                                    <button
                                        className="btn btn-ghost shadow-none"
                                        onClick={() => onDelete(title)}
                                    >
                                        <Icon
                                            icon="boxicons:trash"
                                            style={{ fontSize: 22 }}
                                        />
                                    </button>
                                </div>
                            </div>
                        )}

                    </div>
                </section>


            </aside>

        </>
    )
}