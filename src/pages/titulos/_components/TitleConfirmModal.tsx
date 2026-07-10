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
            className={`
                fixed inset-0 z-50 flex items-center justify-center
                transition-all duration-300
                ${
                    open
                        ? "opacity-100 visible"
                        : "opacity-0 invisible"
                }
            `}
        >
            <div
                onClick={onCancel}
                className={`
                    absolute inset-0 bg-black/70
                    transition-opacity duration-300
                    ${
                        open
                            ? "opacity-100"
                            : "opacity-0"
                    }
                `}
            />

            <div
                className={`
                    relative
                    bg-base-100
                    rounded-xl
                    shadow-2xl
                    p-8
                    w-full
                    max-w-md

                    transition-all duration-300

                    ${
                        open
                            ? "translate-y-0 scale-100 opacity-100"
                            : "translate-y-4 scale-95 opacity-0"
                    }
                `}
            >
                <div className="flex justify-center mb-5">

                    <div className="bg-error/15 text-error rounded-full p-4">

                        <TrashIcon className="size-8"/>

                    </div>

                </div>

                <h2 className="text-xl font-bold text-center">

                    {title}

                </h2>

                <p className="text-center mt-3 opacity-70">

                    {message}

                </p>

                <div className="flex justify-center gap-2 mt-8">

                    <button
                        className="btn shadow-none"
                        onClick={onCancel}
                    >
                        Cancelar
                    </button>

                    <button
                        className="btn btn-error shadow-none"
                        onClick={onConfirm}
                        disabled={loading}
                    >
                        {loading
                            ? "Eliminando..."
                            : "Eliminar"}
                    </button>

                </div>

            </div>

        </div>
    );
}