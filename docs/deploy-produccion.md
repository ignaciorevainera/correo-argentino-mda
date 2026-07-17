# How-To: Deploy a producción

Poner el Portal MDA en producción sobre Windows Server con XAMPP (Apache) + PM2.

---

## Requisitos en el servidor

| Software | Versión | Verificar con |
|---|---|---|
| Node.js | >= 22.12.0 | `node --version` |
| npm | (incluido con Node) | `npm --version` |
| Git | cualquiera | `git --version` |
| PM2 | última | `pm2 --version` |
| XAMPP | 8.x (Apache + PHP) | `httpd -v` |

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

| Variable | Valor de ejemplo en producción |
|---|---|
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"` |
| `INVGATE_API_KEY` | La API key real de InvGate |
| `INVGATE_BASE_URL` | `https://correoargentino.sd.cloud.invgate.net/api/v1/` |
| `INVGATE_API_USERNAME` | `portalmda` |
| `EXTERNAL_STORAGE_DIR` | `C:\data\mda-storage` (ruta absoluta fuera del proyecto) |

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

| Proceso | Puerto / Schedule | Rol |
|---|---|---|
| `correo-argentino-mda` | 4321 | Servidor Astro SSR |
| `mda-ping-cubics` | persistente | Ping a terminales |
| `sync-legacy-inventory` | 05:00, 17:00 | Sincroniza inventario PHP |
| `sync-users` | 02:00 | Sincroniza empleados desde MidPoint |
| `sync-office-links` | 03:00 | Sincroniza vínculos oficina-InvGate |

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
call npm install
call npm run build
call pm2 restart all
```

Podés ejecutarlo manualmente cada vez que haya cambios, o desde un webhook de GitHub.

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

| Comando | Qué hace |
|---|---|
| `pm2 list` | Lista procesos en ejecución |
| `pm2 logs` | Muestra logs en tiempo real |
| `pm2 logs correo-argentino-mda` | Logs del proceso principal |
| `pm2 restart all` | Reinicia todos los procesos |
| `pm2 stop all` | Detiene todos los procesos |
| `pm2 save` | Guarda el listado actual para `pm2 resurrect` |
| `pm2 startup` | Instala script de inicio automático al bootear |
| `pm2 status` | Estado de cada proceso |
