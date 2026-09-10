@echo off
echo [MDA Auto-Deploy] Iniciando actualizacion...
cd C:\Projects\correo-argentino-mda

echo 1. Descargando cambios de GitHub...
git pull origin master
if errorlevel 1 goto :error

echo 2. Deteniendo PM2 antes de tocar dependencias (evita EPERM por dist y lock de .node nativos)...
call pm2 kill
if errorlevel 1 goto :error

echo 3. Instalando nuevas librerias (si las hay)...
call npm install
if errorlevel 1 goto :error

echo 4. Compilando la nueva version de Astro (incluye guard verify-build)...
call npm run build
if errorlevel 1 goto :error

echo 5. Reiniciando el proceso en PM2...
call pm2 start ecosystem.config.cjs
if errorlevel 1 goto :error

echo [MDA Auto-Deploy] Actualizacion completada con exito!
exit /b 0

:error
echo [MDA Auto-Deploy] ERROR: el deploy fallo. PM2 queda detenido - revisar logs y dist/server/entry.mjs (rootDir).
exit /b 1