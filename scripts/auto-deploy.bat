@echo off
echo [MDA Auto-Deploy] Iniciando actualizacion...
cd C:\Projects\correo-argentino-mda

echo 1. Descargando cambios de GitHub...
git pull origin master

echo 2. Instalando nuevas librerias (si las hay)...
call npm install

echo 3. Deteniendo PM2 (libera dist y evita escrituras concurrentes en SQLite)...
call pm2 kill

echo 4. Alineando la base de datos con el schema (idempotente, con backup)...
call npx tsx scripts/align-db-to-schema.mts
if errorlevel 1 (
    echo [MDA Auto-Deploy] ERROR: alineacion de DB fallo. Revisar backup .bak-align mas reciente. PM2 NO reiniciado.
    exit /b 1
)

echo 5. Compilando la nueva version de Astro...
call npm run build
if errorlevel 1 (
    echo [MDA Auto-Deploy] ERROR: build fallo. Iniciando PM2 con version anterior de la DB no es seguro; revisar.
    exit /b 1
)

echo 6. Reiniciando el proceso en PM2...
call pm2 start ecosystem.config.cjs

echo [MDA Auto-Deploy] Actualizacion completada con exito!
