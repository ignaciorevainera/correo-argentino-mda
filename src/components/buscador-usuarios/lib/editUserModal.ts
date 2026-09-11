import { showToast } from "@lib/toastClient";
import { getCleanBase } from "@lib/baseUrl";
import type { BuscadorUser } from "./types";

const cleanBase = getCleanBase();

export type UserUpdatedCallback = (
  dni: string,
  interno: string,
  telefono: string,
) => void;

let onUserUpdatedCallback: UserUpdatedCallback | null = null;

export function openEditModal(user: BuscadorUser): void {
  const editModal = document.getElementById(
    "edit-user-modal",
  ) as HTMLDialogElement | null;
  const editFullname = document.getElementById(
    "edit-user-fullname",
  ) as HTMLInputElement | null;
  const editDni = document.getElementById(
    "edit-user-dni",
  ) as HTMLInputElement | null;
  const editInterno = document.getElementById(
    "edit-user-interno",
  ) as HTMLInputElement | null;
  const editTelefono = document.getElementById(
    "edit-user-telefono",
  ) as HTMLInputElement | null;

  if (
    !editModal ||
    !editFullname ||
    !editDni ||
    !editInterno ||
    !editTelefono
  ) {
    return;
  }

  editFullname.value = user.nombre || "";
  editDni.value = user.dni || "";
  editInterno.value = user.interno || "";
  editTelefono.value = user.telefono || "";

  editModal.showModal();
}

export function closeEditModal(): void {
  const editModal = document.getElementById(
    "edit-user-modal",
  ) as HTMLDialogElement | null;
  const editForm = document.getElementById(
    "edit-user-form",
  ) as HTMLFormElement | null;

  if (editModal) {
    editModal.close();
  }
  if (editForm) {
    editForm.reset();
  }
}

export function initEditUserModal(onUpdated?: UserUpdatedCallback): void {
  onUserUpdatedCallback = onUpdated || null;

  const closeEditModalBtn = document.getElementById("close-edit-modal-btn");
  closeEditModalBtn?.addEventListener("click", closeEditModal);

  const editForm = document.getElementById(
    "edit-user-form",
  ) as HTMLFormElement | null;
  const editDni = document.getElementById(
    "edit-user-dni",
  ) as HTMLInputElement | null;
  const editInterno = document.getElementById(
    "edit-user-interno",
  ) as HTMLInputElement | null;
  const editTelefono = document.getElementById(
    "edit-user-telefono",
  ) as HTMLInputElement | null;
  const saveEditBtn = document.getElementById(
    "save-edit-btn",
  ) as HTMLButtonElement | null;
  const statusText = document.getElementById("search-status");

  editForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!editDni || !editInterno || !editTelefono || !saveEditBtn) return;

    const dni = editDni.value;
    const interno = editInterno.value.trim();
    const telefono = editTelefono.value.trim();

    saveEditBtn.disabled = true;
    saveEditBtn.insertAdjacentHTML(
      "afterbegin",
      '<span class="loading loading-spinner loading-xs" data-save-spinner></span>',
    );

    try {
      const url = `${cleanBase}api/usuarios/${encodeURIComponent(dni)}`;

      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ interno, telefono }),
      });

      if (!response.ok) throw new Error("Error en la respuesta del servidor.");
      const result = await response.json();

      if (result.ok) {
        onUserUpdatedCallback?.(dni, interno, telefono);

        if (statusText) {
          const originalText = statusText.textContent;
          statusText.innerHTML =
            '<span class="text-success font-semibold flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" class="size-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg> ¡Cambios guardados con éxito!</span>';
          setTimeout(() => {
            if (statusText) statusText.textContent = originalText;
          }, 3000);
        }

        showToast("¡Cambios guardados con éxito!", "alert-success");
        closeEditModal();
      } else {
        const errorMsg = result.error || "No se pudo actualizar el contacto.";
        showToast(`Error: ${errorMsg}`, "alert-error");
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Error al conectar con la base de datos.";
      showToast(errorMsg, "alert-error");
    } finally {
      saveEditBtn.disabled = false;
      saveEditBtn.querySelector("[data-save-spinner]")?.remove();
    }
  });
}
