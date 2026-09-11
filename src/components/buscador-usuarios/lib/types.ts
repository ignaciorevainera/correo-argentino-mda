export interface OfficeBranch {
  code: string;
  name?: string;
}

export interface BuscadorUser {
  nombre: string;
  dni: string;
  usuario: string;
  interno: string | null;
  telefono: string | null;
  email: string | null;
  sucursal: string | null;
  sucursalNombre?: string | null;
  sucursales: OfficeBranch[];
  invgateExists: boolean;
}

declare global {
  interface Window {
    __userRole?: string;
  }
}
