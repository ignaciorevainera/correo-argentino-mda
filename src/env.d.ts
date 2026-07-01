/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare module "*.astro" {
  const Component: any;
  export default Component;
}

declare namespace App {
  interface Locals {
    user: {
      id: number;
      username: string;
      role: string;
    };
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
}
