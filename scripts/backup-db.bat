@echo off
echo [MDA Backup] Iniciando copia de seguridad de la base de datos...

:: 1. Obtenemos la fecha actual para el nombre del archivo (ej. 18-05-2026)
set FECHA=%DATE:/=-%
set FECHA=%FECHA: =_%

:: 2. Definimos dónde está la DB original y dónde queremos guardarla
set RUTA_ORIGEN="C:\Projects\correo-argentino-mda\database\mda.db"
set RUTA_DESTINO_LOCAL="C:\Projects\correo-argentino-mda-database-backup\database\mda_backup_%FECHA%.db"
:: set RUTA_DESTINO_RED="\\servidor-correo\backups\mda_backup_%FECHA%.db" (Descomentar si tienen red)

:: 3. Creamos la carpeta local si no existe
if not exist "C:\Projects\correo-argentino-mda-database-backup\database\" mkdir "C:\Projects\correo-argentino-mda-database-backup\database"

:: 4. Hacemos la copia
copy %RUTA_ORIGEN% %RUTA_DESTINO_LOCAL% /Y

echo [MDA Backup] Copia de seguridad completada con exito: %RUTA_DESTINO_LOCAL%