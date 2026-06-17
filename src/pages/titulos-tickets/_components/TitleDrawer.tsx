import type { TitleData } from "@/hooks/useTitlesHook";
import categoryStyles from "./categories";

interface Props {
    open: boolean;
    title: TitleData | null;
    onClose: () => void;
}

export default function TitleDrawer({
    open, title, onClose
}: Props) {
    const categoryConfig = categoryStyles[
        title?.service as keyof typeof categoryStyles
    ] ?? categoryStyles.Otros

    const Icon = categoryConfig.icon;

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
                className={`fixed top-0 right-0 h-screen w-105 bg-base-100 z-50 shadow-2xl transition-transform duration-300 px-4 py-6 overflow-y-scroll
                ${open ? "translate-x-0" : "translate-x-full"}    
                `}
            >
                <header className="flex items-center gap-x-2 mb-4">
                    <article className={`p-2 rounded-md border-neutral-800/70 text-neutral-800
                    ${categoryConfig.bg}`}>
                        <Icon className="size-6" />
                    </article>
                    <article className="flex flex-col">
                        <h3 className="font-bold">
                            {title.title}
                        </h3>
                        <p className="text-xs opacity-70">
                            {title.service}
                        </p>
                    </article>
                </header>

                <div className="bg-base-200/40 p-2 rounded-md flex items-center gap-x-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" className="size-4">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                    </svg>

                    <h4 className="text-xs">
                        Ruta {">"} del ticket {">"} en {">"} Invgate
                    </h4>
                </div>

                <div className="divider mt-6 text-xs">Descripción</div>

                <div className=" bg-base-200/40 p-4 text-sm rounded-md">
                    <p>lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                        incidunt facere adipisci. Non cumque mollitia deleniti animi consequatur nemo recusandae iusto, laborum, excepturi eligendi magnam natus quidem deleniti! Voluptatum autem distinctio nulla dolorum rem, quis, debitis error, itaque eaque nostrum temporibus id impedit perferendis facere deserunt eligendi accusantium. Eum laudantium consectetur, repellendus enim necessitatibus quod reiciendis?
                    </p>

                </div>
                <div className="divider mt-6 text-xs">Base de conocimientos</div>
                <a
                    href="https://correoargentino.sd.cloud.invgate.net/knowledgebase_articles/show/index/article_id/226?columns=category%2Cid%2Ccreated_at%2Csolved_requests%2Crating%2Cviews_count%2Clast_view%2Cvisibility%2Cmodified_at%2Cresponsible"
                    target="_blank"
                    className="bg-base-200/40 hover:bg-primary transition-colors p-4 rounded-md flex items-center gap-x-2 cursor-pointer dark:hover:text-neutral-800 fill-base-200/40 hover:fill-white"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" className="size-4">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                    </svg>
                    <p className="text-xs font-semibold">#226 - Artículo en la base de conocimientos</p>
                </a>

            </aside>

        </>
    )
}