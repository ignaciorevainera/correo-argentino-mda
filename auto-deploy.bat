@echo off
echo [MDA Auto-Deploy] Iniciando actualizacion...
cd C:\Projects\correo-argentino-mda

echo 1. Descargando cambios de GitHub...
git pull origin master

echo 2. Instalando nuevas librerias (si las hay)...
call npm install

echo 3. Compilando la nueva version de Astro...
call npm run build

echo 4. Reiniciando el proceso en PM2...
call pm2 restart all

echo [MDA Auto-Deploy] Actualizacion completada con exito!