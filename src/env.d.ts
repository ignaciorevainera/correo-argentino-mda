/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    user: {
      id: number;
      username: string;
      role: string;
    };
  }
}

/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
