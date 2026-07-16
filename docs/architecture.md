# Arquitectura — Portal MDA

Cómo se conectan las piezas del sistema, qué hace cada una y por qué están donde están.

---

## Vista general

```
┌─ Navegador ─────────────────────────────────────┐
│  Astro SSR  →  Middleware  →  Página / API       │
│       ↓                             ↓            │
│  React islands (interactividad)   Drizzle ORM    │
│       ↓                             ↓            │
│  DaisyUI + Tailwind              SQLite (.db)    │
└──────────────────────────────────────────────────┘
                        ↓
           ┌─────────────────────┐
           │  InvGate API (REST) │
           │  LDAP (usuarios)    │
           └─────────────────────┘
                        ↓
           ┌─────────────────────┐
           │  PM2 (3 procesos)   │
           └─────────────────────┘
```

El navegador pide una URL. Astro la procesa en el servidor (SSR). El middleware verifica sesión y permisos. Si es una página, Astro renderiza HTML. Si es una API, ejecuta lógica de negocio. Los datos viajan por Drizzle ORM hacia SQLite o hacia InvGate.

---

## Capas del sistema

### 1. Presentación — Astro + React + DaisyUI

| Tecnología | Rol |
|---|---|
| **Astro SSR** | Renderiza HTML en el servidor. Cada ruta es un archivo en `src/pages/`. |
| **React islands** | Componentes interactivos (títulos, cronograma, calidad). Se renderizan en cliente. |
| **DaisyUI v5** | Biblioteca de componentes UI sobre Tailwind. Tokens de color, botones, tablas, modales. |
| **Tailwind v4** | Utilidades CSS. Sin archivo de configuración propio. |

**Regla clave:** El HTML se genera en servidor. Solo los componentes con `client:load` o `client:visible` ejecutan JavaScript en el navegador. Esto mantiene el bundle pequeño y las páginas rápidas.

### 2. Aplicación — Páginas y API routes

`src/pages/` tiene dos tipos de archivos:

- **`.astro`** → Páginas visuales. Ej: `/oficinas` → `src/pages/oficinas/index.astro`
- **`.ts`** → Endpoints API. Ej: `POST /api/oficinas` → `src/pages/api/oficinas/index.ts`

Cada archivo `.ts` exporta funciones `GET`, `POST`, `PUT` o `DELETE`. Astro las convierte en endpoints HTTP automáticamente.

### 3. Middleware — `src/middleware.ts`

Se ejecuta en cada request antes de llegar a una página o API. Hace 3 cosas:

1. **Autenticación:** Lee la cookie `session_id`, la verifica (HMAC), busca la sesión en la DB y adjunta `locals.user` a cada request.
2. **Autorización:** Compara la ruta contra la matriz de permisos (`src/lib/rbac.ts`). Si el rol del usuario no tiene acceso, redirige a login o devuelve 401.
3. **Rate limiting:** Controla intentos de login y llamadas API.

### 4. Datos — SQLite + Drizzle ORM

| Componente | Archivo | Rol |
|---|---|---|
| **Archivo DB** | `database/mda.db` | Base SQLite única. Gitignored. |
| **Esquema** | `src/db/schema.ts` | Define tablas, columnas, relaciones y tipos. **40+ tablas.** |
| **Conexión** | `src/db/index.ts` | Inicializa `better-sqlite3` y exporta `db` para todo el proyecto. |
| **Migraciones** | `drizzle-kit push` | Sincroniza el schema con la DB. No usa archivos de migración tradicionales. |

**Flujo de datos típico:**

```
Request POST /api/oficinas
  → middleware.ts (sesión, permisos)
  → pages/api/oficinas/index.ts
    → import { db } from "@db/index"
    → import { offices } from "@db/schema"
    → db.insert(offices).values({...})
    → Response JSON
```

### 5. Lógica de negocio — `src/lib/`

Carpeta con ~44 módulos. Se dividen en:

| Categoría | Ejemplos | Función |
|---|---|---|
| **API helpers** | `api/` | Respuestas toast, redirects con mensajes |
| **Auth** | `session.ts`, `rbac.ts`, `rolesMatrix.ts`, `roleConfig.ts` | Sesión, permisos, roles (5 niveles) |
| **Dominio** | `offices.ts`, `cubics.ts`, `attendance.ts`, `disponibilidad.ts` | Consultas reutilizables por módulo |
| **Integraciones** | `invgate/`, `invgateClient.ts` | Cliente HTTP para InvGate API |
| **Infra** | `encryption.ts`, `auditLogger.ts`, `rateLimit.ts`, `storage.ts` | Cifrado, logs, rate limiting, archivos |

### 6. Integraciones externas

| Sistema | Protocolo | Uso |
|---|---|---|
| **InvGate Service Management** | REST API (Basic Auth) | Obtener incidentes, ubicaciones, KB, tickets, helpdesks. |
| **LDAP (Active Directory)** | LDAP (ldapjs) | Búsqueda de empleados por DNI o username en AD corporativo. |
| **MidPoint** | Web scraping (Playwright) | Sincronización de empleados desde el panel de identidades. |
| **WMS IGN** | HTTP (tiles de mapa) | Capa de mapa base en el directorio de oficinas (Leaflet). |

### 7. Procesos PM2

```
ecosystem.config.cjs
├── correo-argentino-mda  → Astro SSR (puerto 4321)
├── ping-worker           → Ping ICMP a terminales (batch 5→3, cada 3 min)
└── sync-legacy-inventory → Sincroniza inventario desde PHP externo (2×/día)
```

Los workers son scripts Node.js independientes. `ping-worker` y `sync-legacy-inventory` no pasan por Astro ni comparten puerto.

---

## Árbol del proyecto (solo lo esencial)

```
correo-argentino-mda/
├── database/mda.db          ← Datos (gitignored)
├── drizzle/                 ← Output de drizzle-kit
├── public/                  ← Estáticos (descargas, logos, iconos)
├── scripts/                 ← Workers PM2 + utilidades
├── src/
│   ├── components/          ← Componentes reutilizables
│   │   └── ui/              ←   DataTable, Modal, PageContainer, etc.
│   ├── config/              ← Configuración de la app
│   ├── data/                ← Datos estáticos (JSON, enlaces)
│   ├── db/                  ← Conexión + esquema Drizzle
│   ├── hooks/               ← Hooks compartidos (React)
│   ├── layouts/             ← BaseLayout (header, sidebar, footer)
│   ├── lib/                 ← Lógica de negocio (44 módulos)
│   ├── middleware.ts        ← Único middleware global
│   ├── pages/               ← Rutas (páginas y API endpoints)
│   ├── styles/              ← global.css
│   └── types/               ← Tipos TypeScript compartidos
├── tests/                   ← Playwright E2E
├── .env                     ← Config local (gitignored)
└── ecosystem.config.cjs     ← PM2
```

---

## Flujo de request completo

```
1. Navegador → GET /oficinas
2. Astro recibe la request
3. middleware.ts:
   a. Lee cookie session_id
   b. Verifica firma HMAC → obtiene sessionId
   c. Busca sesión en SQLite (sessions table)
   d. Adjunta locals.user
   e. Verifica permisos contra rbac.ts
   f. Aplica rate limiting
   g. setSecurityHeaders: CSP, HSTS, XFO
4. Astro ejecuta pages/oficinas/index.astro:
   a. Renderiza HTML con PageContainer + PageHeader
   b. <DirectorioContent server:defer /> (server island)
   c. <DirectorioSkeleton slot="fallback" />
5. Navegador recibe HTML + skeleton
6. Astro hace segunda request a _server-islands/DirectorioContent
7. Server island recupera searchParams desde Referer
8. Drizzle ORM consulta SQLite (offices + provinces + regions)
9. HTML completo llega al navegador
```

---

## Decisiones de arquitectura

**¿Por qué SQLite y no PostgreSQL?** El portal es una herramienta interna para un equipo pequeño. SQLite elimina latencia de red, no requiere servidor de base de datos, y el archivo se respalda con una copia.

**¿Por qué Astro SSR en vez de SPA?** El contenido es principalmente lectura de datos y navegación entre páginas. SSR entrega HTML listo, mejora tiempo de primera carga y evita el overhead de hidratar todo el árbol de componentes.

**¿Por qué React islands y no un framework completo?** La interactividad pesada se limita a 3-4 módulos (cronograma, calidad, títulos). El resto son páginas estáticas con JS mínimo. React solo se carga donde se necesita.

**¿Por qué PM2 en vez de Docker?** El entorno es un Windows Server con recursos acotados. PM2 es liviano, reinicia procesos caídos, y los scripts de deploy son batch files simples.

---

## Glosario de términos

| Término | Significado |
|---|---|
| **MDA** | Mesa de Ayuda |
| **N1 / N2** | Nivel 1 y Nivel 2 de soporte |
| **Cubic** | Terminal del operador (PC de escritorio) |
| **NIS** | Código de 5 dígitos que identifica una oficina postal |
| **Autogestión** | Ticket o tarea asignada automáticamente a un operador |
| **Guardia Pasiva** | Operador de guardia fuera de horario laboral |
| **DaisyUI** | Biblioteca de componentes UI sobre Tailwind |
| **Server Island** | Componente Astro que se renderiza en servidor, pero en una request separada (diferida) |
