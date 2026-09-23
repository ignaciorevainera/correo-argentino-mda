# How-To: Deploy a producción

Poner el Portal MDA en producción sobre Windows Server con XAMPP (Apache) + PM2.

---

## Requisitos en el servidor

| Software | Versión             | Verificar con    |
| -------- | ------------------- | ---------------- |
| Node.js  | >= 22.12.0          | `node --version` |
| npm      | (incluido con Node) | `npm --version`  |
| Git      | cualquiera          | `git --version`  |
| PM2      | última              | `pm2 --version`  |
| XAMPP    | 8.x (Apache + PHP)  | `httpd -v`       |

Si falta PM2: `npm install -g pm2`

---

## Paso 1: Clonar el repositorio

```powershell
cd C:\
git clone https://github.com/ignaciorevainera/correo-argentino-mda.git
cd correo-argentino-mda
npm install
```

**Resultado:** `node_modules/` creada sin errores.

> Si el proyecto está en otra ruta (ej: `C:\Projects\correo-argentino-mda`), ajustá los paths del resto del documento.

---

## Paso 2: Configurar variables de entorno

```powershell
copy .env.example .env
```

Completá las 6 variables en `.env`. En producción prestá atención a:

| Variable               | Valor de ejemplo en producción                                             |
| ---------------------- | -------------------------------------------------------------------------- |
| `SESSION_SECRET`       | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ENCRYPTION_KEY`       | `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"` |
| `INVGATE_API_KEY`      | La API key real de InvGate                                                 |
| `INVGATE_BASE_URL`     | `https://correoargentino.sd.cloud.invgate.net/api/v1/`                     |
| `INVGATE_API_USERNAME` | `portalmda`                                                                |
| `EXTERNAL_STORAGE_DIR` | `C:\data\mda-storage` (ruta absoluta fuera del proyecto)                   |

> `SESSION_SECRET` y `ENCRYPTION_KEY` deben ser **distintas** a las del entorno local. Generalas de nuevo.

---

## Paso 3: Compilar

```powershell
npm run build
```

**Resultado:** Se genera `dist/` con el SSR bundle. Sin errores de TypeScript.

---

## Paso 4: Arrancar con PM2

```powershell
pm2 start ecosystem.config.cjs
pm2 save
```

**Resultado:** Los 5 procesos se inician:

| Proceso                 | Puerto / Schedule | Rol                                 |
| ----------------------- | ----------------- | ----------------------------------- |
| `correo-argentino-mda`  | 4321              | Servidor Astro SSR                  |
| `mda-ping-cubics`       | persistente       | Ping a terminales                   |
| `sync-legacy-inventory` | 05:00, 17:00      | Sincroniza inventario PHP           |
| `sync-users`            | 02:00             | Sincroniza empleados desde MidPoint |
| `sync-office-links`     | 03:00             | Sincroniza vínculos oficina-InvGate |

Configurá PM2 para que arranque al iniciar Windows:

```powershell
pm2 startup
```

Esto genera un script que instalás como servicio de Windows.

---

## Paso 5: Configurar Apache (XAMPP) como proxy inverso

El servidor Astro escucha en `http://localhost:4321`. Apache expone la URL pública y redirige el tráfico.

### 5.1. Verificar módulos necesarios

En tu `C:\xampp\apache\conf\httpd.conf`, estos módulos ya están activos:

```apache
LoadModule proxy_module modules/mod_proxy.so          ← ya activo
LoadModule proxy_http_module modules/mod_proxy_http.so ← ya activo
LoadModule rewrite_module modules/mod_rewrite.so       ← ya activo
```

No necesitás `proxy_wstunnel` (WebSockets) para MDA.

### 5.2. Crear el Virtual Host

Tu `httpd.conf` ya incluye la línea:

```apache
Include conf/extra/httpd-vhosts.conf
```

El VirtualHost ya existe en `C:\xampp\apache\conf\extra\httpd-vhosts.conf`. En un servidor nuevo tendría este aspecto (adaptado de tu config de producción):

```apache
<VirtualHost *:80>
    ServerName portal-mda.correo.local
    ServerAlias localhost 127.0.0.1

    ProxyPreserveHost On

    ProxyPass / http://localhost:4321/
    ProxyPassReverse / http://localhost:4321/

    ErrorLog "logs/correo-argentino-mda-error.log"
    CustomLog "logs/correo-argentino-mda-access.log" common
</VirtualHost>
```

> **Nota:** El `ServerName` real de tu servidor es `portal-mda.correo.local`. Asegurate de que `astro.config.mjs` tenga `site: "http://portal-mda.correo.local"` si usás URLs absolutas.

Tu servidor ya tiene SSL cargado via:

```apache
Include conf/extra/httpd-ssl.conf
```

Si querés HTTPS, agregá el mismo bloque en `*:443` dentro de `httpd-ssl.conf` con las directivas SSLCertificateFile y SSLCertificateKeyFile.

### 5.3. Verificar el archivo hosts (para pruebas locales)

Si accedés por nombre de dominio local:

```
127.0.0.1  mda.correo.local
```

### 5.4. Reiniciar Apache

```powershell
C:\xampp\apache\bin\httpd.exe -k restart
```

---

## Paso 6: Verificar que funciona

1. Abrí `http://portal-mda.correo.local` (o `http://localhost`) en el navegador
2. Deberías ver la pantalla de login del Portal MDA
3. Verificá que los logs de Apache no muestren errores de proxy:
   ```
   C:\xampp\apache\logs\mda-error.log
   ```

Si ves la página de login, el deploy está completo.

---

## Auto-deploy (actualizar el servidor)

El proyecto incluye `scripts\auto-deploy.bat` con los pasos para actualizar desde Git:

```batch
@echo off
cd C:\Projects\correo-argentino-mda
git pull origin master
call pm2 kill
call npm install
call npm run build
call pm2 start ecosystem.config.cjs
```

`pm2 kill` corre ANTES de `npm install`: con procesos Node/PM2 vivos, Windows no permite reemplazar binarios nativos (`.node`) y deja `node_modules` inconsistente → el build genera un manifest SSR sin `rootDir` → crash loop en runtime. `npm run build` incluye el guard `scripts/verify-build.mjs` que aborta si `rootDir` falta. Ver `docs/lessons.md` (2026-09-07).

### Tarea programada (Windows)

| Campo          | Valor                                                                 |
| -------------- | --------------------------------------------------------------------- |
| Nombre         | `Auto deploy correo-argentino-mda`                                    |
| Accion         | `C:\Projects\correo-argentino-mda\scripts\auto-deploy.bat`            |
| WorkingDirectory | `C:\Projects\correo-argentino-mda\scripts` (directorio, NO el .bat)   |
| Programacion   | Diaria 03:00                                                          |
| Logon          | Password (`esté o no conectado`, usuario `otomasi`)                   |
| Estado         | Habilitada                                                            |

La tarea se re-crea por PowerShell (schtasks no edita WorkingDirectory; el módulo ScheduledTasks viejo no acepta `-LogonType` — con `-User`/`-Password` el logon queda tipo Password):

```powershell
$a = New-ScheduledTaskAction -Execute "C:\Projects\correo-argentino-mda\scripts\auto-deploy.bat" -WorkingDirectory "C:\Projects\correo-argentino-mda\scripts"
$t = New-ScheduledTaskTrigger -Daily -At 3:00AM
Register-ScheduledTask -TaskName "Auto deploy correo-argentino-mda" -Action $a -Trigger $t -User "CORREO\otomasi" -Password "<contrasena-otomasi>" -RunLevel Highest -Force
```

Si `-RunLevel` tampoco existe en el módulo, omitirlo (queda Limited — suficiente para npm/pm2 del perfil usuario).

Nota: en logon no interactivo, `npm`/`pm2` deben resolverse desde el PATH del usuario (`C:\Program Files\nodejs` y `%APPDATA%\npm`); si el run no interactivo falla por esto, fijar el PATH al inicio del `.bat`.

---

## Migración B2: vínculo de horarios por ID (drop de `agent_name`)

Correr **una única vez** al deployar B2, **antes** de que `align-db-to-schema.mts`/`db:push` dropee `schedules.agent_name`. El auto-deploy no incluye migraciones. Todo el flujo está en **un solo script** (`bootstrap-plan-a-b2.mts`), idempotente, dry-run por defecto, backup WAL-safe.

### Caso pre-Plan-A (prod que nunca recibió Plan A: `schedules` sin `agent_id`, `agents` sin `user_id`)

Checklist copiable (ventana de mantenimiento):

```
0. git pull                                              # los scripts deben existir en el repo
1. Pausar la tarea programada de auto-deploy
2. pm2 stop all                                          # ⚠ OBLIGATORIO: detener PM2 antes de migrar
3. scripts\backup-db.bat                                 # backup externo (opcional; el script ya hace backup WAL-safe)
4. npx tsx scripts/bootstrap-plan-a-b2.mts --populate    # dry-run: revisar el reporte
5. npx tsx scripts/bootstrap-plan-a-b2.mts --apply --populate
6. npm install && npm run build                          # build nuevo antes de levantar
7. pm2 start all
8. npx drizzle-kit push                                  # debe responder "No changes detected"
```

⚠ **Detener PM2 (paso 2) es obligatorio.** El código viejo escribe `schedules.agent_name`, columna que el align elimina: con la app corriendo, los guardados del cronograma fallarían (`NOT NULL constraint failed`) durante y después de la migración.

El paso 5 hace **todo**: agrega `schedules.agent_id` + `agents.user_id`, backfillea vínculos por nombre/username, crea shells para nombres sin agente, sanea `hidden_helpdesks` huérfanas, corre `align-db-to-schema.mts` (drop de `agent_name`, paridad, FK, integridad) y la **Fase 5** (sincroniza `mesas` desde InvGate, asigna todos los usuarios a MDA TI, setea flags por rol y marca `assignable` para MDA TI/Coord).

> ⚠ El saneo borra filas de `hidden_helpdesks` cuyo `invgate_id` no exista en `mesas` (preferencias de ocultamiento, no críticas). Si `mesas` no existe, se crea vacía y se sanean todas las filas. El dry-run lo reporta.

### Fase 5 (`--populate`) — DB era master

Si la DB es vieja (era master), tras el align `users` queda sin mesa (`helpdesk_id`/`helpdesk_name` NULL → fail-closed) y `agents` con los 4 flags en false (`GET /api/cronograma` filtra `enCronograma = true` → cronograma vacío). La Fase 5 resuelve esto:

- Requiere env `INVGATE_API_KEY`, `INVGATE_BASE_URL`, `INVGATE_API_USERNAME` (los carga desde `.env`).
- Sincroniza `mesas` desde InvGate (`fetchInvGateMesas`), asigna **todos** los usuarios a `TI_GSM_MDA TI` y setea flags por rol:

  | Rol | cronograma | cubic | calidad | AGS |
  |---|---|---|---|---|
  | `supervisor` | ✗ | ✗ | ✗ | ✗ |
  | `team_leader` | ✓ | ✓ | ✗ | ✗ |
  | `agent`, `admin`, `referent` | ✓ | ✓ | ✓ | ✓ |

- Idempotente y con backup. En dry-run pre-align muestra el preview (conteos) pero no escribe.
- Asume que **todos** los usuarios pertenecen a MDA TI (caso actual). Si hubiera usuarios de otra mesa, revisar el reporte antes de aplicar.

### Caso post-Plan-A (prod que ya corrió Plan A: tiene `agent_id`/`user_id`)

Los pasos 2-3 del script son no-op; igual conviene ejecutarlo una vez (detecta el estado) o correr directo `npx tsx scripts/align-db-to-schema.mts`. `--populate` sigue siendo útil si faltan mesas/asignaciones.

> Nunca correr `--apply` sin revisar el dry-run. Si se dropea `agent_name` antes de vincular, los horarios huérfanos (`agent_id IS NULL`) no se pueden vincular y quedan invisibles para los lectores id-only (cronograma, asistencia, disponibilidad).

### Mesa asignable (`mesas.assignable`)

`align-db-to-schema.mts`/`db:push` agrega `mesas.assignable` (default `false`): tras la migración, ninguna mesa es elegible en el select de alta/edición de usuario salvo MDA TI (exenta por código).

**La migración one-shot ya lo cubre**: el paso 5 (`--apply --populate`) marca `assignable = 1` para `ALLOWED_HELPDESK_NAMES` (MDA TI y Coord). El script `seed-assignable-mesas.mts` queda solo como **respaldo/idempotente** si por algún motivo no se corrió el bootstrap:

1. Dry-run: `npx tsx scripts/seed-assignable-mesas.mts`
2. Aplicar: `npx tsx scripts/seed-assignable-mesas.mts --apply` (backup WAL-safe, idempotente; marca `true` las mesas de `ALLOWED_HELPDESK_NAMES`)

Luego el admin cura el resto de mesas desde `/admin/usuarios/mesas-de-ayuda`.

---

## Migración Plan B — drop de `agents.username`

- **Alcance:** el código de la rama `feat/agents-userid-plan-b` elimina la columna `agents.username`; la identidad usuario↔agente queda 100% por `agents.user_id`.
- **NO usar `scripts/auto-deploy.bat` para este release:** los lectores por `user_id` deben pasar el audit antes de servir tráfico.

Orden crítico:

```
1. scripts\backup-db.bat                               # backup de database/mda.db
2. pm2 stop mda-ping-cubics sync-legacy-inventory sync-users sync-office-links
                                                       # + detener el proceso Astro: la DB no puede estar en uso durante el rebuild de tablas
3. git pull (rama mergeada) + npm install + npm run build
4. npx tsx scripts/bootstrap-plan-a-b2.mts              # dry-run: solo si el paso 5 reporta vínculos pendientes
   npx tsx scripts/bootstrap-plan-a-b2.mts --apply      # aplicar solo en ese caso
5. npm run audit:agents-userid -- --save                # debe dar AUDIT OK (si FAIL: vincular pendientes antes de seguir; no dropear)
6. npx tsx scripts/align-db-to-schema.mts               # dropea agents.username (backup automático mda.bak-align-*.db, foreign_key_check + integrity_check)
7. npm run audit:agents-userid -- --check               # AUDIT OK, sin claves con conteo decreciente
8. pm2 start ecosystem.config.cjs
9. smoke: login admin → alta de usuario en /admin/usuarios → verificar que aparece en /supervision/cronograma,
   AGS (/supervision/asignacion-ags), calidad y asistencia; editar ubicación desde cronograma
```

- **Rollback:** restaurar el backup del paso 1 (`copy` sobre `database/mda.db`) + redeploy del commit anterior. El drop no es reversible in-place sin el backup.
- **Nota:** los snapshots generados en `drizzle/` quedaron con la columna vieja; `npm run db:push` es no-op seguro (diff contra schema actual) pero el runbook oficial de DDL es `align-db-to-schema.mts`, nunca `drizzle-kit migrate`.
- **Verificación mínima post-deploy:** `npx playwright test tests/admin tests/usuarios tests/cronograma tests/lifecycle` (requiere dev/prod en 4321).

---

## Errores comunes

### Apache devuelve 503 Service Unavailable

```
[proxy:error] AH00959: ap_proxy_connect_backend disabling worker for (localhost) for 60s
```

**Causa:** Astro no está corriendo o no responde en el puerto 4321.

**Solución:**

```powershell
pm2 list                    # Verificar si el proceso existe
pm2 logs correo-argentino-mda --lines 20  # Ver el último error
pm2 restart correo-argentino-mda
```

### Apache no arranca por sintaxis inválida

```
Syntax error on line ... of httpd-vhosts.conf: Invalid command 'ProxyPass'
```

**Causa:** No se habilitaron los módulos `mod_proxy` y `mod_proxy_http`.

**Solución:** Descomentar las líneas `LoadModule` en `httpd.conf` y reiniciar Apache.

### PM2 no reconoce el comando

```
pm2 : El término 'pm2' no se reconoce...
```

**Causa:** PM2 no está instalado globalmente o no está en el PATH.

**Solución:**

```powershell
npm install -g pm2
```

### El build falla por falta de memoria o archivos

```
Error: ENOSPC: no space left on device
```

**Causa:** Disco lleno o `dist/` corrupto de un build anterior.

**Solución:**

```powershell
Remove-Item -Recurse -Force dist
npm run build
```

### La app arranca pero no encuentra la base de datos

```
Error: Cannot find database/mda.db
```

**Causa:** El proyecto se clonó sin la base de datos (está en `.gitignore`).

**Solución:**

```powershell
npm run db:push
```

Si necesitás los datos de producción, copiá `database/mda.db` desde el servidor anterior.

---

## Comandos útiles de PM2

| Comando                         | Qué hace                                       |
| ------------------------------- | ---------------------------------------------- |
| `pm2 list`                      | Lista procesos en ejecución                    |
| `pm2 logs`                      | Muestra logs en tiempo real                    |
| `pm2 logs correo-argentino-mda` | Logs del proceso principal                     |
| `pm2 restart all`               | Reinicia todos los procesos                    |
| `pm2 stop all`                  | Detiene todos los procesos                     |
| `pm2 save`                      | Guarda el listado actual para `pm2 resurrect`  |
| `pm2 startup`                   | Instala script de inicio automático al bootear |
| `pm2 status`                    | Estado de cada proceso                         |
