# Quick Start — Portal MDA

En 15 minutos tenés el entorno local funcionando: app corriendo, base de datos creada y tests pasando.

---

## Requisitos

| Software | Versión mínima | Verificá con |
|---|---|---|
| Node.js | >= 22.12.0 | `node --version` |
| npm | (incluido con Node) | `npm --version` |
| Git | cualquiera reciente | `git --version` |

## 1. Clonar e instalar dependencias

```powershell
git clone https://github.com/ignaciorevainera/correo-argentino-mda.git
cd correo-argentino-mda
npm install
```

**Resultado:** La terminal muestra los paquetes instalados sin errores. Aparece la carpeta `node_modules/`.

## 2. Crear archivo de entorno

```powershell
copy .env.example .env
```

Abrí `.env` y completá estas 6 variables:

| Variable | Valor |
|---|---|
| `SESSION_SECRET` | Generalo con: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ENCRYPTION_KEY` | Generalo con: `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"` |
| `INVGATE_API_KEY` | Pedilo a un administrador del proyecto |
| `INVGATE_BASE_URL` | `https://correoargentino.sd.cloud.invgate.net/api/v1/` |
| `INVGATE_API_USERNAME` | `portalmda` |
| `EXTERNAL_STORAGE_DIR` | `./data/storage` |

> Si `INVGATE_API_KEY` está vacía el servidor arranca, pero las funciones que consultan InvGate (incidentes, ubicaciones, búsquedas) fallan en silencio.

> `.env` está en `.gitignore`. Nunca lo commitees.

## 3. Crear la base de datos

```powershell
npm run db:push
```

**Resultado:** Drizzle ORM crea `database/mda.db` con todas las tablas del schema. La consola confirma las tablas creadas.

## 4. Verificar que compila

```powershell
npm run build
```

**Resultado:** Se genera la carpeta `dist/`. Sin errores de TypeScript ni advertencias.

## 5. Iniciar el servidor de desarrollo

```powershell
npm run dev
```

**Resultado:** El servidor arranca en `http://localhost:4321`. Abrí esa URL en el navegador. Deberías ver la pantalla de inicio de sesión.

## 6. Ejecutar los tests

Dejá el servidor de desarrollo corriendo. Abrí **otra terminal** en la misma carpeta y ejecutá:

```powershell
npx playwright test
```

**Resultado:** Los tests E2E se ejecutan en serie. Todos pasan.

---

## Errores comunes

### Desajuste de migraciones

```
Schema mismatch — drizzle-kit detects differences
```

**Causa:** Cambiaste de rama o actualizaste `src/db/schema.ts` y la base local quedó desincronizada.

```
npx tsx scripts/fix-drizzle-mismatch.ts
npm run db:push
```

### Variables de entorno faltantes

```
Error [ERR_HTTP_HEADERS_SENT] o vista con error 500
```

**Causa:** Alguna variable obligatoria de `.env` está vacía o mal escrita.

**Solución:** Compará `.env` contra `.env.example`. Las 6 variables deben tener valor asignado.

### Puerto 4321 ocupado

```
Error: Port 4321 is already in use
```

**Causa:** Ya hay un proceso (otro proyecto, otra instancia) usando el mismo puerto.

```
npm run dev -- --port 4322
```

### Playwright no encuentra el servidor

```
Error: page.goto: net::ERR_CONNECTION_REFUSED
```

**Causa:** Olvidaste iniciar `npm run dev` antes de ejecutar los tests, o el servidor se cayó.

**Solución:** Verificá que `http://localhost:4321` responda en el navegador, luego ejecutá los tests de nuevo.

---

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (hot reload) |
| `npm run build` | Compila para producción |
| `npm run preview` | Sirve el build localmente |
| `npm run db:push` | Sincroniza schema Drizzle con SQLite |
| `npm run db:studio` | Abre Drizzle Studio para explorar datos |
| `npx playwright test` | Ejecuta tests E2E |
| `npm run astro -- --help` | Ayuda del CLI de Astro |
