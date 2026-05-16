// src/env.d.ts
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
