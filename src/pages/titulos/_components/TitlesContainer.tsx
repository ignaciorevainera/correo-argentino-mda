"use client";

import { useState } from "react";
import { useTitles, type Title } from "@hooks/useTitlesHook";

import TitleCard from "./TitleCard";
import TitleDrawer from "./TitleDrawer";
import { TitleCardSkeleton } from "./TitleCardSkeleton";

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline"

export default function TitlesContainer() {
  const {
    loading, filters, filteredTitles, searchQuery, activeFilter, favorites,
    setSearchQuery, setActiveFilter, toggleFavorite, copyToClipboard,
  } = useTitles();

  const [selectedTitle, setSelectedTitle] = useState<Title | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleOpenDrawer = (title: Title) => {
    setSelectedTitle(title);
    setDrawerOpen(true);
  };

  return (
    <>
      <header className="w-full bg-base-100 h-28 pt-3 sticky -top-6 z-10 border-b border-base-300 ">
        <label className="input max-w-xl w-full rounded-md group">
          <MagnifyingGlassIcon className="size-6 opacity-50 group-hover:opacity-100 group-hover:text-primary transition" />
          <input
            type="search"
            className="grow"
            placeholder="Buscar título"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </label>
        <div className="flex items-center gap-x-2 mt-4">
          {loading ? (
            Array.from({ length: 5 }).map((_, index) => (
              <button key={index} className="btn btn-xs shadow-none skeleton w-16 h-6" />
            ))
          ) : (
            filters.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`btn btn-xs hover:btn-primary shadow-none ${activeFilter === filter ? "btn-primary" : ""}`}
              >
                {filter}
              </button>
            ))
          )}
        </div>
      </header >
      <section className="min-h-128">
        {loading ? <TitleCardSkeleton count={30} />
          : (
            <>
              {filteredTitles.length === 0 ? (
                <div className="bg-base-200 mt-8 h-48 w-full rounded-md flex flex-col items-center justify-center gap-y-1">
                  <h3 className="text-xl font-semibold">
                    No se encontraron coincidencias
                  </h3>
                  <p className="text-sm opacity-70">
                    Intentá con otro término
                  </p>
                </div>
              ) : (
                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-4">
                  {filteredTitles
                    .map((title) => (
                      <TitleCard
                        key={title.id}
                        title={title}
                        onOpen={handleOpenDrawer}
                        isFavorite={favorites.includes(title.name)}
                        onToggleFavorite={toggleFavorite}
                        onCopy={copyToClipboard}
                      />
                    ))}
                </section>
              )}
            </>
          )}
      </section>
      <TitleDrawer
        open={drawerOpen}
        title={selectedTitle}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
