/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
import type { ViewProfile } from "./lib/viewSimulation";

declare module "*.astro" {
  const Component: any;
  export default Component;
}

declare global {
  namespace App {
    interface Locals {
      user: {
        id: number;
        username: string;
        role: string;
        helpdeskId: number | null;
        helpdeskName: string | null;
      };
      sessionId: string | null;
      /** Simulación de vista (sólo admin real). null = vista real. */
      viewAs: ViewProfile | null;
    }
  }

  interface HTMLDialogElement extends HTMLElement {
    showModal(): void;
    close(returnValue?: string): void;
  }

  interface HTMLInputElement extends HTMLElement {
    value: string;
  }

  interface ImportMetaEnv {
    readonly INVGATE_API_KEY: string;
    readonly INVGATE_BASE_URL: string;
    readonly INVGATE_API_USERNAME: string;
    readonly EXTERNAL_STORAGE_DIR: string;
  }
}

declare module "topojson-client";
