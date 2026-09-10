import { useEffect, useState } from "react";
import type { Title, TitleFormData } from "@/hooks/useTitlesHook";
import { showToast } from "@lib/toastClient";

interface Category {
  id: number;
  name: string;
}

interface Props {
  open: boolean;
  mode: "create" | "edit";
  title?: Title | null;
  categories: Category[];
  onClose: () => void;
  onSubmit: (data: TitleFormData) => Promise<boolean>;
}

const EMPTY_FORM: TitleFormData = {
  name: "",
  categoryId: 0,
  route: "",
  description: "",
  articleOnKdb: "",
};

export default function TitleModal({
  open,
  mode,
  title,
  categories,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<TitleFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({
    name: false,
    category: false,
  });

  useEffect(() => {
    setErrors({
      name: false,
      category: false,
    });

    if (mode === "edit" && title) {
      setForm({
        name: title.name,
        categoryId: title.categoryId,
        route: title.route ?? "",
        description: title.description ?? "",
        articleOnKdb: "", // Se deja sin efecto hasta futuras versiones, donde se tratará implementación con Invgate
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [mode, title, open]);

  async function handleSubmit() {
    const hasNameError = !form.name.trim();
    const hasCategoryError = form.categoryId === 0;
    setErrors({
      name: hasNameError,
      category: hasCategoryError,
    });

    const errors: string[] = [];

    if (!form.name.trim()) {
      errors.push("Nombre");
    }

    if (form.categoryId === 0) {
      errors.push("Categoría");
    }

    if (errors.length > 0) {
      showToast(
        `Los siguientes campos son obligatorios: ${errors.join(", ")}`,
        "alert-warning",
        4000,
      );
      return;
    }
    setSaving(true);
    const ok = await onSubmit(form);
    setSaving(false);

    if (ok) {
      onClose();
    }
  }

  const clearError = (field: keyof typeof errors) => {
    setErrors((prev) => ({
      ...prev,
      [field]: false,
    }));
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/80 transition-opacity ${open ? "visible opacity-100" : "invisible opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-0 z-40 flex items-center justify-center transition-all duration-300 ${open ? "visible opacity-100" : "invisible opacity-0"}`}
      >
        <form
          className={`bg-base-100 relative w-full max-w-xl rounded-xl p-6 shadow-2xl transition-all duration-300 ${open ? "translate-y-0 scale-100 opacity-100" : "translate-y-6 scale-95 opacity-0"}`}
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <h2 className="mb-6 text-xl font-bold">
            {mode === "create" ? "Nuevo título" : "Editar título"}
          </h2>
          <div className="space-y-4">
            <div>
              <p className="text-base-content pb-2 text-sm">Nombre *</p>
              <input
                className={`input input-bordered w-full ${
                  errors.name ? "input-error" : ""
                }`}
                placeholder="Escribí el nombre del título"
                value={form.name}
                onChange={(e) => {
                  setForm({
                    ...form,
                    name: e.target.value,
                  });

                  clearError("name");
                }}
              />
            </div>
            <div>
              <p className="text-base-content pb-2 text-sm">Categoría *</p>
              <select
                className={`select select-bordered w-full ${errors.category ? "select-error" : ""}`}
                value={form.categoryId}
                onChange={(e) => {
                  setForm({
                    ...form,
                    categoryId: Number(e.target.value),
                  });
                  clearError("category");
                }}
              >
                <option value={0}>Seleccione categoría</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-base-content pb-2 text-sm">Ruta en Invgate</p>
              <input
                className="input input-bordered w-full"
                placeholder="Escribí la ruta de asignación dentro de Invgate"
                value={form.route}
                onChange={(e) =>
                  setForm({
                    ...form,
                    route: e.target.value,
                  })
                }
              />
            </div>
            {/* <div>
                            <p className="text-sm pb-2 text-base-content">
                                Artículo dentro de la base de conocimientos
                            </p>
                            <input
                                className="input input-bordered w-full"
                                placeholder="Escribí el número del artículo sin #"
                                value={form.articleOnKdb}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        articleOnKdb:
                                            e.target.value,
                                    })
                                }
                            />
                            Se deja sin efecto hasta futuras versiones, donde se tratará implementación con Invgate
                        </div> */}
            <div>
              <p className="text-base-content pb-2 text-sm">Descripción</p>
              <textarea
                className="textarea textarea-bordered h-36 w-full"
                placeholder="Escribí la descripción del ticket"
                value={form.description}
                onChange={(e) =>
                  setForm({
                    ...form,
                    description: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <p className="text-base-content mt-4 text-sm">
            * Estos campos son obligatorios
          </p>
          <div className="mt-8 flex justify-end gap-2">
            <button
              className="btn btn-ghost shadow-none"
              onClick={onClose}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary shadow-none"
              disabled={saving}
              type="submit"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
