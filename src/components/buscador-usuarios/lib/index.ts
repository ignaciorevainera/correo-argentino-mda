import { initInvgateSync } from "./invgateSync";
import { initTerminalModal, updatePanelFades } from "./terminalModal";
import { initEditUserModal } from "./editUserModal";
import { initTicketModal } from "./ticketModal";
import {
  initSearchState,
  handleSearch,
  triggerSearch,
  updateCurrentUser,
} from "./searchState";

export * from "./types";
export * from "./invgateSync";
export * from "./terminalModal";
export * from "./editUserModal";
export * from "./ticketModal";
export * from "./cardRenderer";
export * from "./searchState";

function init(): void {
  updatePanelFades(document.getElementById("panel-details-scroll"));

  initTicketModal();

  initEditUserModal((dni, interno, telefono) => {
    updateCurrentUser(dni, interno, telefono);
  });

  initTerminalModal((managerName) => {
    triggerSearch(managerName);
  });

  initInvgateSync(() => {
    handleSearch();
  });

  initSearchState();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
