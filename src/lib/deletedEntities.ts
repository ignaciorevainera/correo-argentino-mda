export interface DeletedEntityMeta {
  /** Nombre legible de la entidad (para la columna "Entidad"). */
  label: string;
  /** Ícono boxicons representativo. */
  icon: string;
  /** Clase de color DaisyUI para el ícono. */
  tone: string;
}

/**
 * Metadatos de presentación por entidad borrable. Las claves coinciden con el
 * campo `entity` guardado en `deleted_records`.
 */
export const DELETED_ENTITY_META: Record<string, DeletedEntityMeta> = {
  oficina: {
    label: "Oficina",
    icon: "boxicons:building-house-filled",
    tone: "text-secondary",
  },
  cubic: {
    label: "Cubic",
    icon: "boxicons:desktop-filled",
    tone: "text-accent",
  },
  agente: {
    label: "Agente",
    icon: "boxicons:user-id-card-filled",
    tone: "text-primary",
  },
  aplicativo: {
    label: "Aplicativo",
    icon: "boxicons:grid-circle-diagonal-right-filled",
    tone: "text-accent",
  },
  enlace: {
    label: "Enlace",
    icon: "boxicons:link-filled",
    tone: "text-info",
  },
  contacto: {
    label: "Contacto",
    icon: "boxicons:phone-filled",
    tone: "text-primary",
  },
  titulo: {
    label: "Título",
    icon: "boxicons:list-ul-filled",
    tone: "text-neutral",
  },
  categoria: {
    label: "Categoría",
    icon: "boxicons:folder",
    tone: "text-warning",
  },
};

const FALLBACK_META: DeletedEntityMeta = {
  label: "Registro",
  icon: "boxicons:trash",
  tone: "text-base-content/60",
};

export function getDeletedEntityMeta(entity: string): DeletedEntityMeta {
  return DELETED_ENTITY_META[entity] ?? { ...FALLBACK_META, label: entity };
}
