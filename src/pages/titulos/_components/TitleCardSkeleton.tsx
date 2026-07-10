interface Props {
    count?: number
}

export const TitleCardSkeleton = ({ count = 8 }: Props) => {
    return (
        <section className="skeleton-debounced grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-4">
            {Array.from({ length: count }).map((_, index) => (
                <article key={index} className="card bg-base-200/30 card-compact border border-base-300 h-32">
                    <header className="card-header flex items-center gap-x-2 p-3">
                        <article className="p-2 skeleton rounded-md">
                            <div className="size-4.5" />
                        </article>
                        <article className="flex flex-col gap-2">
                            <div className="skeleton h-3 w-28"></div>
                            <div className="skeleton h-3 w-20"></div>
                        </article>
                    </header>
                    <article className="card-body flex flex-row items-end justify-between gap-x-1 px-3 pb-3.5">
                        <div className="skeleton rounded-md ml-2 size-4" />
                        <div className="flex">
                            <span className="rounded-md skeleton mr-3 size-4"/>
                            <span className="skeleton rounded-sm pr-0.5 h-4 w-18"/>
                        </div>
                    </article>
                </article>
            ))}
        </section>
    )
}