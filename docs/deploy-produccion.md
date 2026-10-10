# How-To: Deploy a producción

Poner el Portal MDA en producción sobre Windows Server con XAMPP (Apache) + PM2.

> ## ⚠️ IMPORTANTE — PowerShell como Administrador
>
> **Todos** los comandos de este documento (deploy, build, `pm2 start/stop/kill`,
> `npm install`, borrado de `dist/`) deben ejecutarse en una **PowerShell elevada
> como Administrador**: clic derecho sobre Windows PowerShell → *Ejecutar como
> administrador*, o *Ejecutar como administrador* en el menú contextual del
> `.bat`. Verificar antes de empezar:
>
> ```powershell
> ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
> # tiene que devolver True
> ```
>
> Si devuelve `False`, **detenerse**. Con una consola sin elevación:
>
> - `pm2 stop all` / `pm2 kill` falla con `connect EPERM \\.\pipe\rpc.sock`
>   (el named pipe del daemon no concede `connect` a un token sin admin), y el
>   fallo **no se puede resolver** con `del "%USERPROFILE%\.pm2\rpc.sock"`.
> - `npm install` deja `node_modules` inconsistente si algún proceso Node sigue
>   vivo: los `.node` nativos (ej. `better-sqlite3.node`) están cargados en
>   memoria y no se pueden reemplazar (`EBUSY/EPERM`).
> - `taskkill /F /IM node.exe` puede no alcanzar los procesos de otro usuario.
>
> Además, el daemon de PM2 debe haber sido arrancado **por el mismo usuario y con
> la misma elevación** que la consola que después lo opera. Si se mezclan, PM2
> queda inutilizable y hay que matar el daemon desde una consola elevada.

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

Completá las variables en `.env`. En producción prestá atención a:

| Variable               | Valor de ejemplo en producción                                             |
| ---------------------- | -------------------------------------------------------------------------- |
| `SESSION_SECRET`       | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ENCRYPTION_KEY`       | `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"` |
| `INVGATE_API_KEY`      | La API key real de InvGate                                                 |
| `INVGATE_BASE_URL`     | `https://correoargentino.sd.cloud.invgate.net/api/v1/`                     |
| `INVGATE_API_USERNAME` | `portalmda`                                                                |
| `WISE_CX_BASE_URL`     | `https://api.wcx.cloud`                                                    |
| `WISE_CX_API_KEY`      | La API key real de Wise CX                                                 |
| `WISE_CX_API_USER`     | Usuario asociado a la API key en Wise CX                                   |
| `EXTERNAL_STORAGE_DIR` | `C:\data\mda-storage` (ruta absoluta fuera del proyecto)                   |
| `SESSION_COOKIE_SECURE` | `true` en `ecosystem.config.cjs` (solo cuando HTTPS está activo) |

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

> **Nota:** El hostname canónico es `mda.correo.local` (debe coincidir con el SAN del certificado; `astro.config.mjs` usa `site: "https://mda.correo.local"`). `portal-mda.correo.local` se mantiene como alias del vhost.

### 5.3. Configurar HTTPS (certificado interno AD CS)

En `httpd.conf`, verificar/descomentar:

```apache
LoadModule ssl_module modules/mod_ssl.so
LoadModule socache_shmcb_module modules/mod_socache_shmcb.so
LoadModule headers_module modules/mod_headers.so
Include conf/extra/httpd-ssl.conf
```

En B1842zacw1718 el certificado y la key ya están en disco:

| Archivo | Ruta | Notas |
| ------- | ---- | ----- |
| Certificado | `C:/xampp/apache/conf/ssl/Portal_MDA.cer` | PEM, hoja sola, CN `mda.correo.local`; SAN `mda.correo.local`, `b1842zacw1718.correo.local`, `10.254.59.95`; vence 20-sep-2028 |
| Private key | `C:/xampp/apache/conf/ssl.key/Portal_MDA_key.pem` | RSA sin cifrar (PKCS#1) |

La CA emisora (`correo-B1842ZACS0136-CA-1`) es raíz autofirmada y ya está en el store de Raíces de confianza de las máquinas del dominio (GPO). Por eso **no hace falta `SSLCertificateChainFile`**: Apache sirve solo la hoja.

Editar `C:\xampp\apache\conf\extra\httpd-ssl.conf`, dentro de `<VirtualHost _default_:443>` (el archivo ya trae `Listen 443`):

```apache
<VirtualHost _default_:443>
    DocumentRoot "C:/xampp/htdocs"
    ServerName mda.correo.local:443
    ServerAlias portal-mda.correo.local b1842zacw1718.correo.local

    SSLEngine on
    SSLCertificateFile    "C:/xampp/apache/conf/ssl/Portal_MDA.cer"
    SSLCertificateKeyFile "C:/xampp/apache/conf/ssl.key/Portal_MDA_key.pem"

    ProxyPreserveHost On

    # Mismas exclusiones que el vhost :80 (phpMyAdmin y endpoint PHP legacy)
    ProxyPass /phpmyadmin !
    ProxyPass /api_mda_find_extension !

    ProxyPass / http://localhost:4321/
    ProxyPassReverse / http://localhost:4321/

    ErrorLog "logs/correo-argentino-mda-ssl-error.log"
    CustomLog "logs/correo-argentino-mda-ssl-access.log" common
</VirtualHost>
```

> Reemplazar las directivas del bloque default (`DocumentRoot`, `ServerName www.example.com:443`, `SSLCertificateFile conf/ssl.crt/server.crt`, `SSLCertificateKeyFile conf/ssl.key/server.key`). No agregar un vhost nuevo: el default snakeoil quedaría como catch-all.

En `C:\xampp\apache\conf\extra\httpd-vhosts.conf`, reemplazar el vhost `*:80` existente por un redirect permanente:

```apache
<VirtualHost *:80>
    ServerName portal-mda.correo.local
    ServerAlias mda.correo.local localhost 127.0.0.1
    Redirect permanent / https://mda.correo.local/
</VirtualHost>
```

Con el redirect, `http://mda.correo.local/api_mda_find_extension` y `/phpmyadmin` pasan a HTTPS (las exclusiones viven en el vhost `:443`). Los consumidores GET siguen funcionando por el 301.

Requisitos previos: `mda.correo.local` debe resolver (DNS interno o `hosts`) y el firewall del server debe permitir TCP 443 entrante. Verificar:

```powershell
Resolve-DnsName mda.correo.local
Get-NetFirewallRule -Enabled True -Direction Inbound -Action Allow |
  Get-NetFirewallPortFilter | Where-Object LocalPort -eq 443
```

Validar sintaxis y reiniciar:

```powershell
C:\xampp\apache\bin\httpd.exe -t
C:\xampp\apache\bin\httpd.exe -k restart
```

Verificación rápida desde el server:

```powershell
C:\xampp\apache\bin\openssl.exe s_client -connect mda.correo.local:443 -servername mda.correo.local
curl.exe -sI http://mda.correo.local  | Select-String "HTTP/"
curl.exe -sI https://mda.correo.local | Select-String "HTTP/"
curl.exe -sI http://mda.correo.local/login
curl.exe -sI https://mda.correo.local/login
```

El primero debe devolver 301. Los clientes fuera del dominio verán aviso de certificado: la raíz interna no está en sus stores (esperado para `.correo.local`).

> La app ya está adaptada: cookie de sesión `secure` vía `SESSION_COOKIE_SECURE` (`src/lib/session.ts` y `ecosystem.config.cjs`), `site` HTTPS en `astro.config.mjs` y URL de la extensión en `src/components/buscador-usuarios/ChromeExtensionBanner.astro`.
### 5.4. Verificar el archivo hosts (para pruebas locales)

Si accedés por nombre de dominio local:

```
127.0.0.1  mda.correo.local
```

### 5.5. Reiniciar Apache

```powershell
C:\xampp\apache\bin\httpd.exe -k restart
```

---

## Paso 6: Verificar que funciona

1. Abrí `https://mda.correo.local` en el navegador
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
call npx tsx scripts/align-db-to-schema.mts
call npx tsx scripts/backfill-asistencia.mts --apply
call npm run build
call pm2 start ecosystem.config.cjs
```

`pm2 kill` corre ANTES de `npm install`: con procesos Node/PM2 vivos, Windows no permite reemplazar binarios nativos (`.node`) y deja `node_modules` inconsistente → el build genera un manifest SSR sin `rootDir` → crash loop en runtime. `npm run build` incluye el guard `scripts/verify-build.mjs` que aborta si `rootDir` falta. Ver `docs/lessons.md` (2026-09-07).

Entre `npm install` y el build el auto-deploy alinea la DB host (`align-db-to-schema.mts`, idempotente, con backup) y corre el backfill one-time de `agents.en_asistencia` (`backfill-asistencia.mts --apply`, dry-run revisable a mano). Si cualquiera falla, aborta sin reiniciar PM2.

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

### `Refused to apply style ... MIME type ('text/html')` — assets con hash viejo

Síntoma en el navegador (consola):

```
Refused to apply style from 'https://mda.correo.local/_astro/BaseLayout.ZAHcvL_6.css'
because its MIME type ('text/html') is not a supported stylesheet MIME type.
```

Ocurre con `.css`, pero también con cualquier `/_astro/*.js`, `*.woff2`, `*.svg`.

**Causa:** doble. (1) `dist/client` y `dist/server` desalineados: el HTML que
genera el proceso de Node referencia hashes de un build que **ya no existe** en
`dist/client/_astro` (el navegador pide `BaseLayout.ZAHcvL_6.css` y en disco sólo
está `BaseLayout.4TrmIHSh.css`). Ocurre cuando se corre `npm run build` con PM2
vivo, o con dos builds simultáneos. (2) `server.mjs` no tiene guarda para
`/_astro/*`: si `express.static("dist/client")` no encuentra el archivo, el
request cae al handler SSR de Astro, que responde la página 404 en HTML con
`Content-Type: text/html`. Un `.css` devuelto como HTML es exactamente este error.

**Diagnóstico** (PowerShell **como Administrador**, con PM2 detenido):

```powershell
pm2 kill
taskkill /F /IM node.exe

# ¿Coincide lo que pide el server con lo que hay en disco?
$refs = Select-String -Path dist\server\entry.mjs -Pattern '_astro/[A-Za-z0-9_.-]+' -AllMatches |
        ForEach-Object { $_.Matches.Value } | Sort-Object -Unique
$missing = $refs | Where-Object { -not (Test-Path (Join-Path 'dist\client' $_)) }
"referencias: $($refs.Count)  faltantes: $($missing.Count)"
$missing
```

`faltantes: 0` en un healthy deploy. Si hay refs faltantes, el `dist` está incompleto.

**Solución** — rebuild limpio, PM2 **siempre** detenido antes:

```powershell
pm2 kill
taskkill /F /IM node.exe
Remove-Item -Recurse -Force dist
npm run build
node scripts/verify-build.mjs
pm2 start ecosystem.config.cjs
```

Luego una verificación de integridad (el chequeo que hoy falta en
`verify-build.mjs`, que solo valida `rootDir`):

```powershell
$refs = Select-String -Path dist\server\entry.mjs -Pattern '_astro/[A-Za-z0-9_.-]+' -AllMatches |
        ForEach-Object { $_.Matches.Value } | Sort-Object -Unique
$missing = $refs | Where-Object { -not (Test-Path (Join-Path 'dist\client' $_)) }
if ($missing) { "DIST INCOMPLETO:"; $missing; exit 1 } else { "OK: $($refs.Count) assets presentes" }
```

**Nunca** validar assets contra `astro preview`: en `mode: "middleware"` no
sirve `dist/client` y devuelve `200 text/html` para todo `/_astro/*`.
Validar contra `dist/client/_astro` o contra el server real de PM2.

### `pm2 stop all` falla con `connect EPERM \\.\pipe\rpc.sock`

```
[PM2] Spawning PM2 daemon with pm2_home=C:\Users\Otomasi\.pm2
Error: connect EPERM \\.\pipe\rpc.sock
    at PipeConnectWrap.afterConnect [as oncomplete] (node:net:1705:16)
  errno: -4048, code: 'EPERM', syscall: 'connect', address: '\\\\.\\pipe\\rpc.sock'
```

El patrón es revelador: PM2 **no encuentra** el daemon, intenta spawnear uno
nuevo, y el daemon nuevo tampoco puede abrir el named pipe.

**Causa:** la consola actual no tiene elevación de Administrador (o corre como
otro usuario) mientras que el daemon existente corre elevado. La ACL del named
pipe `\\.\pipe\rpc.sock` no concede `connect` a un token sin admin. Causa
secundaria: daemon muerto con el archivo `rpc.sock` huérfano en
`%USERPROFILE%\.pm2`.

**Solución — primero y sin excepción, PowerShell como Administrador:**

```powershell
# 1. Verificar elevación. False => parar acá y reabrir la consola como admin.
([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# 2. Ver quién tiene el daemon
tasklist /FI "IMAGENAME eq node.exe" /V
dir "$env:USERPROFILE\.pm2"

# 3. Matar todo (incluido el daemon huérfano) y borrar el pipe
pm2 kill
taskkill /F /IM node.exe
Remove-Item -Force "$env:USERPROFILE\.pm2\rpc.sock" -ErrorAction SilentlyContinue

# 4. Reconstruir y arrancar desde la MISMA consola elevada
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

Reglas que evitan que vuelva:

- **Todo** deploy manual o programado corre en consola elevada.
- El daemon de PM2 se arranca **una sola vez**, desde la consola elevada del
  usuario real del servicio. Nunca mezclado: daemon de SYSTEM o de otro usuario
  con consola sin admin.
- La tarea programada de Windows debe correr con la opción *Ejecutar con
  privilegios más altos* habilitada, y "Iniciar en" apuntando a la **carpeta**
  (no al `.bat`, que daba `ERROR_DIRECTORY` 0x10B).
- Con PM2 caído, **Apache devuelve 503**. Es el síntoma esperado, no un problema
  de proxy: revolvé primero PM2.

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
