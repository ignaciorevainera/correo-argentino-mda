"use client";

import { useState } from "react";
import { useTitles, type Title } from "@hooks/useTitlesHook";

import TitleCard from "./TitleCard";
import TitleDrawer from "./TitleDrawer";
import TitleModal from "./TitleModal";
import TitleConfirmModal from "./TitleConfirmModal";
import { TitleCardSkeleton } from "./TitleCardSkeleton";

import { MagnifyingGlassIcon, PlusCircleIcon } from "@heroicons/react/24/outline"

export default function TitlesContainer() {
  const {
    loading, filters, filteredTitles, searchQuery, activeFilter, favorites,
    setSearchQuery, setActiveFilter, toggleFavorite, copyToClipboard,
    createTitle, updateTitle, deleteTitle, categories
  } = useTitles();

  const [selectedTitle, setSelectedTitle] = useState<Title | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const [titleToDelete, setTitleToDelete] =
    useState<Title | null>(null);

  const handleOpenDrawer = (title: Title) => {
    setSelectedTitle(title);
    setDrawerOpen(true);
  };

  const handleCreate = () => {
    setSelectedTitle(null);
    setCreateModalOpen(true);
  };

  const handleEdit = () => {

    if (!selectedTitle) return;

    setDrawerOpen(false);

    setEditModalOpen(true);

  };


  const handleDelete = (title: Title) => {

    setTitleToDelete(title);
    console.log(titleToDelete?.name)

    setDeleteModalOpen(true);

  };

  const confirmDelete = async () => {

    if (!titleToDelete) return;

    const ok = await deleteTitle(titleToDelete.id);

    if (ok) {

      setDeleteModalOpen(false);

      setTitleToDelete(null);

    }

  };


  return (
    <div className="flex flex-col">
      <header className="w-full bg-base-100 h-28 pt-3 pb-4 px-2 sticky -top-6 z-10 border-b border-base-300/40 flex flex-row items-center">
        <article>
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

        </article>
        <button className="btn btn-sm shadow-none btn-primary ml-auto" onClick={handleCreate}>
          <PlusCircleIcon className="size-5" />
          Nuevo título
        </button>

      </header >
      <section className="min-h-128 pb-4 ">
        {loading ? <TitleCardSkeleton count={30} />
          : (
            <>
              {filteredTitles.length === 0 ? (
                <div className="bg-base-200 h-48 w-full rounded-md flex flex-col items-center justify-center gap-y-1">
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
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCopy={copyToClipboard}
      />
      <TitleModal
        open={createModalOpen}
        mode="create"
        categories={categories}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={createTitle}
      />
      <TitleModal
        open={editModalOpen}
        mode="edit"
        title={selectedTitle}
        categories={categories}
        onClose={() => setEditModalOpen(false)}
        onSubmit={(data) =>
          updateTitle(selectedTitle!.id, data)
        }
      />
      <TitleConfirmModal
        open={deleteModalOpen}
        title={`${titleToDelete?.name}`}
        message={`¿Seguro que deseas eliminar este título? Esta acción no se puede deshacer.`}
        onCancel={() => setDeleteModalOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}