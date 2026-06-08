# Correo Argentino - Portal MDA

> Portal web unificado para la operación técnica diaria de la Mesa de Ayuda (MDA) de Correo Argentino.

![Astro](https://img.shields.io/badge/Astro-BC52EE?style=for-the-badge&logo=astro&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![DaisyUI](https://img.shields.io/badge/DaisyUI-FF9903?style=for-the-badge&logo=daisyui&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![PM2](https://img.shields.io/badge/PM2-2B037A?style=for-the-badge&logo=pm2&logoColor=white)

---

## Overview

El **Portal MDA** es una plataforma interna diseñada para centralizar, optimizar y agilizar las tareas operativas de los operadores. La plataforma consolida herramientas críticas como el inventario de terminales, el directorio de oficinas, la asignación de autogestiones, el cronograma de asistencia, el catálogo de aplicativos y un generador de firmas institucionales.

---

## Features

El portal se compone de los siguientes módulos operativos clave, estructurados según su disposición en el menú de navegación lateral:

### 1. Supervisión

Panel de control para supervisores y referentes que centraliza el cronograma (asignación horaria de operadores), el monitoreo de calidad del equipo y el seguimiento de las autogestiones asignadas.

<!-- Screenshot: Módulo de Supervisión Operativa (Cronograma, Calidad y Autogestiones) -->

![Supervisión](./docs/images/supervision.png)

### 2. Títulos de tickets

Módulo de tipificación rápida de incidencias recurrentes con funciones de copia inmediata al portapapeles.

<!-- Screenshot: Listado de Títulos de Tickets para tipificación rápida -->

![Títulos de tickets](./docs/images/titulos-tickets.png)

### 3. Guía de soportes

Matriz de derivación interactiva que define responsables, prioridades y canales de resolución según el área y tipo de incidencia.

<!-- Screenshot: Matriz de Guía de Soportes y derivaciones -->

![Guía de soportes](./docs/images/guia-soportes.png)

### 4. Buscador de usuarios

Buscador de personal de la corporación para validar cuentas, nombres, legajos y datos básicos de usuario.

<!-- Screenshot: Buscador de personal y validación de usuarios -->

![Buscador de usuarios](./docs/images/buscador-usuarios.png)

### 5. Generador de firmas

Creador interactivo de firmas de correo electrónico institucionales adaptado a los lineamientos estandarizados de la marca.

<!-- Screenshot: Creador interactivo de firmas corporativas -->

![Generador de firmas](./docs/images/generador-firmas.png)

### 6. Contactos

Directorio de teléfonos internos de soporte y correos corporativos útiles.

<!-- Screenshot: Directorio telefónico y de contactos de soporte -->

![Contactos](./docs/images/contactos.png)

### 7. Enlaces y recursos (Catálogo de aplicativos)

Hub de accesos rápidos a utilidades web externas y catálogo integrado de instaladores de software autorizados para descargas seguras.

<!-- Screenshot: Hub de Enlaces y Catálogo de Aplicativos homologados -->

![Catálogo de Aplicativos](./docs/images/catalogo-aplicativos.png)

### 8. Directorio de oficinas

Catálogo completo de sucursales a lo largo de todo el país.

<!-- Screenshot: Directorio de oficinas -->

![Directorio de oficinas](./docs/images/directorio-oficinas.png)

### 9. Inventario de equipos

Monitoreo y consulta del parque de terminales operativas (hostnames, direcciones IP, marcas, memoria RAM y sistema operativo).

<!-- Screenshot: Inventario técnico de terminales activas -->

![Inventario de equipos](./docs/images/inventario-equipos.png)

### 10. Panel de administración

Consola CRUD exclusiva para la gestión integral de base de datos (usuarios, cubics, oficinas, contactos, recursos, operadores) y logs de auditoría.

<!-- Screenshot: Panel de administración y auditoría de la base de datos -->

![Panel de administración](./docs/images/admin.png)

---

## Tech Stack

La arquitectura está construida sobre las siguientes tecnologías:

- **Frontend & Server (SSR):**
  - ![Astro](https://img.shields.io/badge/Astro-BC52EE?style=for-the-badge&logo=astro&logoColor=white) v5/v6 en modo `output: 'server'` con el adaptador `@astrojs/node` en ejecución independiente (_standalone_).
  - ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white) v4 y ![DaisyUI](https://img.shields.io/badge/DaisyUI-FF9903?style=for-the-badge&logo=daisyui&logoColor=white) v5 para una interfaz altamente densa, responsiva y adaptable con soporte nativo para alternancia de temas claros/oscuros (`theme-change`).
  - **React (islas interactivas):** Para componentes interactivos complejos de renderizado dinámico en cliente.
- **Backend & Database:**
  - ![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white) `>=22.12.0` como entorno de ejecución.
  - ![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white) como motor de persistencia relacional a través de `better-sqlite3`, residiendo en un único archivo físico local libre de latencias TCP.
  - ![Drizzle](https://img.shields.io/badge/Drizzle-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black) ORM para la definición estricta de esquemas, consultas y tipado seguro de extremo a extremo.
- **Testing:**
  - ![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white) para la ejecución automatizada de pruebas de integración de componentes UI, simulaciones de flujo y filtrado de datos.
- **Orquestación & Automatización:**
  - ![PM2](https://img.shields.io/badge/PM2-2B037A?style=for-the-badge&logo=pm2&logoColor=white) para la gestión de servicios backend, monitoreo físico y sincronización de datos heredados.

---

## Process Orchestration

El entorno de producción y los daemons auxiliares del portal están orquestados de manera automatizada y continua a través de **PM2** mediante tres procesos principales:

- **`correo-argentino-mda`**: Servidor principal que expone la aplicación Astro SSR (Server-Side Rendering) a través del puerto 4321, gestionando la entrega de vistas dinámicas y el control de accesos.
- **`mda-ping-cubics`**: Proceso persistente que realiza el diagnóstico de conexión de las terminales.
- **`sync-legacy-inventory`**: Proceso programado tipo _cron_ que se ejecuta dos veces al día (a las 05:00 y a las 17:00 horas) para sincronizar y actualizar la información de terminales desde la base de datos de inventario heredada.

---

## Project Structure

A continuación se detalla la distribución de archivos clave en la raíz del proyecto:

```
correo-argentino-mda/
├── database/                # Archivo físico de base de datos local SQLite (mda.db)
├── drizzle/                 # Historial y definición de migraciones generadas por Drizzle
├── public/                  # Recursos estáticos (descargas de aplicativos, logos, fuentes)
├── scripts/                 # Scripts de automatización y daemons de segundo plano
│   ├── ping-worker.ts       # Algoritmo de diagnóstico físico segmentado de terminales
│   └── sync-legacy-inventory.ts # Tarea de sincronización del inventario legado
├── src/                     # Código fuente principal de la aplicación Astro
│   ├── components/          # Componentes de UI comunes y específicos de vistas
│   ├── data/                # Consultas estáticas, enlaces y diccionarios de datos
│   ├── db/                  # Configuración de Drizzle ORM, inicialización de SQLite y esquemas de tablas
│   ├── layouts/             # Contenedores estructurales de interfaz (BaseLayout)
│   ├── middleware.ts        # Control de autenticación de sesión y autorización basada en roles
│   └── pages/               # Vistas de la aplicación estructuradas según el Sitemap funcional
└── tests/                   # Pruebas de integración y extremo a extremo usando Playwright
```

---
