import { memo } from "react";
import type { Title } from "@hooks/useTitlesHook";
import { ClipboardIcon, ChevronRightIcon, BookmarkIcon } from "@heroicons/react/24/outline";

import { Icon } from "@iconify/react";

interface Props {
    title: Title;
    isFavorite: boolean;
    onOpen: (title: Title) => void;
    onToggleFavorite: (title: string) => void;
    onCopy: (title: string) => void;
}

function TitleCard({
    title, isFavorite,
    onOpen, onToggleFavorite, onCopy
}: Props) {
    return (
        <article className="card bg-base-200 card-compact border border-base-300 h-32 hover:scale-102 transition-transform">
            <header className="card-header flex items-center gap-x-2 p-3">
                <article className={`grid size-9 place-items-center p-2 rounded-md border border-neutral-800/70 text-neutral-800 ${title.tone}`}>
                    <Icon
                        icon={`boxicons:${title.icon}`}
                        style={{ fontSize: 18}}
                    />
                </article>
                <article className="flex flex-col text-xs">
                    <h3 className="truncate max-w-46 cursor-pointer" onClick={() => onCopy(title.name)}>
                        {title.name}
                    </h3>
                    <p className="text-neutral-600 dark:text-neutral-400">
                        {title.category}
                    </p>
                </article>
            </header>

            <article className="card-body flex flex-row items-end justify-between gap-x-1 p-3">
                <label className="tooltip" data-tip="Favoritos">
                    <button
                        className="btn btn-ghost btn-xs shadow-none"
                        onClick={() => onToggleFavorite(title.name)}
                    >
                        {isFavorite
                            ? <BookmarkIcon className="size-4 fill-amber-300 dark:text-primary" />
                            : <BookmarkIcon className="size-4" />
                        }
                    </button>
                </label>
                <div>
                    <label className="tooltip" data-tip="Copiar título">
                        <button
                            className="  btn btn-ghost btn-xs shadow-none"
                            onClick={() => onCopy(title.name)}
                        >
                            <ClipboardIcon className="size-4" />
                        </button>
                    </label>
                    <button className="btn btn-ghost btn-xs shadow-none pr-0.5" onClick={() => onOpen(title)}>
                        Ver más
                        <ChevronRightIcon className="size-4" />
                    </button>
                </div>
            </article>
        </article>
    )
}

export default memo(TitleCard);