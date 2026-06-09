# Encapsulación Buscador Usuarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aislar la carga de la lógica pesada y estructura de la página de Buscador de Usuarios utilizando Astro Server Islands para priorizar el renderizado inmediato de la interfaz principal (sidebar/header).

**Architecture:** Se crearán dos nuevos componentes dentro de `src/components/buscador-usuarios/`. `BuscadorUsuariosSkeleton.astro` servirá como el placeholder inmediato, renderizando estáticamente el contenedor de la página, la barra de búsqueda simulada, el CTA y los skeletons de las tarjetas de resultados. `BuscadorUsuariosContent.astro` contendrá la lógica completa, los componentes interactivos reales, los modales y los scripts (extrayendo todo el contenido de la página actual). Luego, `index.astro` utilizará la directiva `server:defer` para cargar asíncronamente el componente Content, utilizando el Skeleton como su propiedad `slot="fallback"`.

**Tech Stack:** Astro, Astro Server Islands (`server:defer`), TailwindCSS, DaisyUI, JavaScript (Vanilla DOM).

---

### Task 1: Crear Componente Skeleton

**Files:**
- Create: `src/components/buscador-usuarios/BuscadorUsuariosSkeleton.astro`

- [ ] **Step 1: Crear la estructura estática del Skeleton**
Crear el archivo `src/components/buscador-usuarios/BuscadorUsuariosSkeleton.astro` replicando la interfaz visual de la página (Header, Búsqueda, y la grilla de Skeleton) sin la interactividad.

```astro
---
import PageContainer from "@components/ui/PageContainer.astro";
import PageHeader from "@components/ui/PageHeader.astro";
import { Icon } from "astro-icon/components";
---

<PageContainer>
  <div class="grid lg:grid-cols-3 gap-6 mb-8">
    <section class="lg:col-span-2 py-8 px-6 md:px-8 rounded-2xl bg-base-200/50 border border-base-300 shadow-md flex flex-col justify-center">
      <PageHeader
        description="Acceso rápido a contacto, internos y dependencias de todo el personal."
        class="mb-6 text-left"
        titleClass="text-2xl md:text-3xl"
      />

      <div class="w-full relative group opacity-70">
        <div class="join w-full shadow-md rounded-xl overflow-hidden border border-base-300 bg-base-100">
          <div class="relative flex-1">
            <div class="absolute inset-y-0 left-4 flex items-center pointer-events-none opacity-40">
              <Icon name="boxicons:search" size={24} />
            </div>
            <input
              type="text"
              placeholder="Cargando buscador..."
              class="w-full pl-12 pr-16 h-14 bg-transparent focus:outline-hidden text-base sm:text-lg cursor-not-allowed"
              disabled
            />
          </div>
        </div>
      </div>

      <div class="mt-4 flex items-center gap-2 text-xs sm:text-sm text-base-content/50">
        <span class="loading loading-spinner loading-xs text-primary"></span>
        <span>Preparando interfaz...</span>
      </div>
    </section>

    <div class="group relative flex flex-col justify-center p-6 lg:p-8 rounded-2xl border border-accent/20 bg-linear-to-br from-accent/5 via-transparent to-transparent backdrop-blur-md opacity-80 overflow-hidden">
      <div class="absolute -bottom-12 -right-12 size-48 bg-accent/10 rounded-full blur-3xl"></div>
      <div class="flex items-center gap-4 mb-4 relative z-10">
        <div class="size-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent shrink-0 shadow-inner">
          <Icon name="boxicons:puzzle-filled" size={24} />
        </div>
        <div>
          <h4 class="font-bold text-lg text-accent tracking-tight leading-tight">Extensión MDA</h4>
          <div class="text-[10px] font-bold text-base-content/40 uppercase tracking-widest mt-1">Chrome / Edge</div>
        </div>
      </div>
      <p class="text-sm text-base-content/60 leading-relaxed relative z-10 flex-1">
        Cargando acceso directo a la extensión...
      </p>
    </div>
  </div>

  <section>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-xl font-bold flex items-center gap-2">
        Usuarios sugeridos <span class="badge badge-sm badge-neutral">0</span>
      </h2>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {
        [1, 2, 3, 4, 5, 6].map(() => (
          <div class="card bg-base-200/50 border border-base-300 shadow-md animate-pulse">
            <div class="card-body p-4 gap-3">
              <div class="flex items-center gap-3">
                <div class="size-12 rounded-full bg-base-300" />
                <div class="flex-1 space-y-2">
                  <div class="h-4 bg-base-300 rounded w-3/4" />
                  <div class="h-3 bg-base-300 rounded w-1/2" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-2 mt-2">
                <div class="h-8 bg-base-300 rounded" />
                <div class="h-8 bg-base-300 rounded" />
              </div>
            </div>
          </div>
        ))
      }
    </div>
  </section>
</PageContainer>
