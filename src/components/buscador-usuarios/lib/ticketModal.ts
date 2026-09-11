import { showToast } from "@lib/toastClient";
import { getCleanBase } from "@lib/baseUrl";
import type { BuscadorUser } from "./types";

const cleanBase = getCleanBase();

let selectedUserForTicket: BuscadorUser | null = null;

export function openTicketModal(user: BuscadorUser): void {
  const ticketModal = document.getElementById("invgate-ticket-modal") as HTMLDialogElement | null;
  const modalUserName = document.getElementById("modal-user-name");
  if (!ticketModal || !modalUserName) return;

  selectedUserForTicket = user;
  modalUserName.textContent = user.nombre || "Usuario";
  ticketModal.showModal();
}

export function closeTicketModal(): void {
  const ticketModal = document.getElementById("invgate-ticket-modal") as HTMLDialogElement | null;
  ticketModal?.close();
}

export function initTicketModal(): void {
  const confirmCreateTicketBtn = document.getElementById(
    "confirm-create-ticket-btn",
  ) as HTMLButtonElement | null;

  confirmCreateTicketBtn?.addEventListener("click", async () => {
    if (!selectedUserForTicket || !confirmCreateTicketBtn) return;

    const originalText = confirmCreateTicketBtn.innerHTML;
    confirmCreateTicketBtn.disabled = true;
    confirmCreateTicketBtn.innerHTML =
      '<span class="loading loading-spinner loading-xs"></span> Creando...';

    try {
      const response = await fetch(`${cleanBase}api/usuarios/create-invgate-ticket`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          usuario: selectedUserForTicket.usuario,
          nombreCompleto: selectedUserForTicket.nombre,
          dni: selectedUserForTicket.dni,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        closeTicketModal();
        if (data.ticketUrl) {
          window.open(data.ticketUrl, "_blank");
          showToast(
            "Ticket creado con éxito y abierto en una nueva pestaña.",
            "alert-success",
            6000,
          );
        } else {
          showToast("Ticket creado con éxito.", "alert-success");
        }
      } else {
        showToast(data.error || "Error al crear el ticket.", "alert-error");
      }
    } catch {
      showToast("Error de conexión al crear el ticket.", "alert-error");
    } finally {
      confirmCreateTicketBtn.disabled = false;
      confirmCreateTicketBtn.innerHTML = originalText;
    }
  });
}
