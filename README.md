# 📬 Portal de la Mesa de Ayuda (MDA)

![Astro](https://img.shields.io/badge/Astro-BC52EE?style=for-the-badge&logo=astro&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![PM2](https://img.shields.io/badge/PM2-2B037A?style=for-the-badge&logo=pm2&logoColor=white)

## 🎯 Propósito del Proyecto

El **Portal MDA** está diseñado específicamente para optimizar el flujo operativo diario de la mesa de ayuda. Consolida la documentación técnica mediante archivos interactivos, un buscador dinámico de usuarios por documento, un catálogo centralizado de sucursales con telegrafía e inventarios de hardware, desacoplando interfaces de usuario reactivas de subprocesos automáticos de red.

## 🛠️ Stack Tecnológico

- **Capa Frontend / Servidor:** **Astro v5** en modalidad SSR (Server-Side Rendering) sobre Node.js, garantizando payloads mínimos y tiempos de carga ultra-rápidos en la red interna.
- **Motor de Base de Datos:** **SQLite**, una base de datos relacional autocontenida y embebida en un único archivo físico (`mda.db`), evitando la sobrecarga de conexiones TCP/IP de motores tradicionales.
- **Capa del ORM:** **Drizzle ORM**, implementando consultas seguras, tipado estricto de datos de extremo a extremo e integridad referencial.
- **Orquestador de Procesos:** **PM2**, administrando los ciclos de vida de la aplicación web y los motores de escaneo en segundo plano (daemons).

## 📡 Arquitectura de Red y Monitoreo Amigable

### ⚡ Radar de Terminales (`mda-ping-cubics`)

Para mitigar alarmas perimetrales y prevenir falsos positivos de denegación de servicio (DDoS) en los switches corporativos, el motor de monitoreo implementa un **Algoritmo Segmentado por Lotes Dinámicos**:

1. **Lote Inicial:** Realiza el diagnóstico físico secuencial de las primeras **5 terminales críticas (Cubics)**.
2. **Pausa Estricta:** Introduce un estado de suspensión asíncrona profunda de **3 minutos (180s)**.
3. **Lotes Subsiguientes:** Consume los bloques restantes en tandas de **3 terminales**, aplicando pausas idénticas.
4. **Re-indexación:** Al finalizar el mapa global, vuelve a leer la base de datos de forma nativa por si se incorporaron activos nuevos.

## 🔒 Capa de Seguridad y Persistencia Stateful

- **Sesiones Centralizadas (Stateful Auth):** Los accesos se validan mediante cookies httpOnly firmadas que contrastan un identificador único (UUID v4) contra la tabla `sessions` en SQLite.
- **Revocación Remota Inmediata:** Permite invalidar y patear sesiones expuestas en terminales ajenas o cubics de forma centralizada purgando el registro en la base de datos sin necesidad de reiniciar servicios.
- **Seguridad en Capas:** Control y restricción de privilegios mediante Middleware en servidor (`admin` vs `user`), impidiendo transacciones no autorizadas en el ORM.

## ⚙️ Automatización DevOps y Plan de Contingencia (DRP)

Las tareas de mantenimiento se orquestan mediante el **Programador de Tareas de Windows** en el host de la siguiente manera:

- **02:00 AM 💾 `backup-db.bat`:** Genera un resguardo físico histórico y sellado por fecha de la base de datos local (`mda_backup_DD-MM-AAAA.db`), permitiendo una recuperación total ante fallos catastróficos en menos de 5 segundos.
- **03:00 AM 🚀 `auto-deploy.bat`:** Descarga las actualizaciones limpias del repositorio (`git pull`), sincroniza dependencias (`npm install`), compila la distribución optimizada (`npm run build`) y efectúa un reinicio caliente en PM2.
