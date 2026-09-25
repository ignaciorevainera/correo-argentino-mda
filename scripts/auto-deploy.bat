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

echo 4. Alineando la base de datos con el schema (idempotente, con backup)...
call npx tsx scripts/align-db-to-schema.mts
if errorlevel 1 (
    echo [MDA Auto-Deploy] ERROR: alineacion de DB fallo. Revisar backup .bak-align mas reciente. PM2 NO reiniciado.
    exit /b 1
)

echo 5. Inicializando el flag de asistencia (idempotente, con backup)...
call npx tsx scripts/backfill-asistencia.mts --apply
if errorlevel 1 (
    echo [MDA Auto-Deploy] ERROR: backfill de asistencia fallo. PM2 NO reiniciado.
    exit /b 1
)

echo 6. Compilando la nueva version de Astro (incluye guard verify-build)...
call npm run build
if errorlevel 1 (
    echo [MDA Auto-Deploy] ERROR: build fallo. Iniciando PM2 con version anterior de la DB no es seguro; revisar.
    exit /b 1
)

echo 7. Reiniciando el proceso en PM2...
call pm2 start ecosystem.config.cjs
if errorlevel 1 goto :error

echo [MDA Auto-Deploy] Actualizacion completada con exito!
exit /b 0

:error
echo [MDA Auto-Deploy] ERROR: el deploy fallo. PM2 queda detenido - revisar logs y dist/server/entry.mjs (rootDir).
exit /b 1
