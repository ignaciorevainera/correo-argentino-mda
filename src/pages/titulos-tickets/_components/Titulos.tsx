import { useMemo } from "react";
import { useTitles, type TitleData } from "../../../hooks/useTitlesHook";
import CopiedIcon from "./CopiedIcon";

export default function TitlesApp() {
  const {
    titles,
    filteredTitles,
    loading,
    searchQuery,
    copiedIndex,
    setSearchQuery,
    copyToClipboard,
  } = useTitles();

  const grouped = useMemo(() => {
    return filteredTitles.reduce((acc, t, i) => {
      const key = t.title.charAt(0).toUpperCase();

      if (!acc[key]) acc[key] = [];

      acc[key].push({
        ...t,
        index: i,
      });
      return acc;
    }, {} as Record<string, (TitleData & { index: number })[]>);
  }, [filteredTitles]);

  return (
    <main>
      <header className="w-full max-w-md">
        <label className="input input-bordered w-full" htmlFor="links-search">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}

            className="grow"
            placeholder="Buscar título"
            aria-label="Buscar título"
          />
        </label>
      </header>

      <div className="pt-6 pb-16">
        {loading ? (
          <p>Cargando...</p>
        ) : (
          <>
            {filteredTitles.length === 0 ? (
              <p className="text-sm font-medium">
                No se encontraron títulos
              </p>
            ) : (
              <>

                {Object.keys(grouped)
                  .sort((a, b) => a.localeCompare(b, "es"))
                  .map((letter) => (

                    <div key={letter} className="mt-8">
                      {/* Header + Separador */}
                      <section className="py-2 flex items-center gap-x-2 mb-4">
                        <article className="flex items-center justify-center size-7 rounded-sm bg-primary">
                          <h2 className="text-sm bg-primary font-semibold text-neutral-800">{letter}</h2>
                        </article>
                        <span className="h-px block bg-gray-300 dark:bg-neutral-800 w-full" />
                      </section>

                      {/* Grid */}
                      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {grouped[letter].map((t) => (
                          <article
                            key={`${t.title}-${t.index}`}
                            className={"card card-compact bg-base-100 border border-base-300 h-full transition-all duration-200 hover:shadow-lg hover:border-primary cursor-pointer" + (copiedIndex === t.index ? " bg-primary border-primary" : "")}
                            onClick={() => copyToClipboard(t.title, t.index)}
                          >
                            <div className="card-body">

                              {copiedIndex === t.index ? (
                                <div className="flex items-center justify-center  text-sm font-medium text-neutral-800">
                                  <CopiedIcon/>

                                </div>
                              ) :
                                <h3 className="text-sm">
                                  {t.title}
                                </h3>
                              }
                            </div>
                          </article>
                        ))}
                      </section>
                    </div>
                  ))}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}