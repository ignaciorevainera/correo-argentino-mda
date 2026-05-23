/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

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
