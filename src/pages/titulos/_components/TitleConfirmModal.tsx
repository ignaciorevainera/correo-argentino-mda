import { TrashIcon } from "@heroicons/react/24/outline";

interface Props {
  open: boolean;
  title: string;
  message: string;

  loading?: boolean;

  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ${
        open ? "visible opacity-100" : "invisible opacity-0"
      } `}
    >
      <div
        onClick={onCancel}
        className={`absolute inset-0 bg-black/70 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        } `}
      />

      <div
        className={`bg-base-100 relative w-full max-w-md rounded-xl p-8 shadow-2xl transition-all duration-300 ${
          open
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-4 scale-95 opacity-0"
        } `}
      >
        <div className="mb-5 flex justify-center">
          <div className="bg-error/15 text-error rounded-full p-4">
            <TrashIcon className="size-8" />
          </div>
        </div>

        <h2 className="text-center text-xl font-bold">{title}</h2>

        <p className="mt-3 text-center opacity-70">{message}</p>

        <div className="mt-8 flex justify-center gap-2">
          <button className="btn shadow-none" onClick={onCancel}>
            Cancelar
          </button>

          <button
            className="btn btn-error shadow-none"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
